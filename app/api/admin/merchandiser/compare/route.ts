import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  compareMerchandiserCandidates,
  recordMerchandiserDecision,
} from "@/lib/suppliers/merchandiser";
import type { MerchandiserScoreBreakdown } from "@/lib/suppliers/merchandiser";
import { logError } from "@/lib/utils/logger";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(2).max(8),
});

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = bodySchema.parse(await req.json());
    const rows = await prisma.merchandiserRecommendation.findMany({
      where: { id: { in: body.ids } },
    });
    if (rows.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Trenger minst to anbefalinger" },
        { status: 400 }
      );
    }

    const result = compareMerchandiserCandidates(
      rows.map((r) => ({
        id: r.id,
        title: r.title || r.supplierProductId,
        overallScore: r.overallScore,
        scores: r.scores as MerchandiserScoreBreakdown,
        reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
        imageUrl: r.imageUrl,
      }))
    );

    await recordMerchandiserDecision({
      recommendationId: result.winnerId,
      supplier: rows.find((r) => r.id === result.winnerId)!.supplier,
      supplierProductId: rows.find((r) => r.id === result.winnerId)!.supplierProductId,
      decision: "compare_pick",
      actorId: auth.userId,
      actorEmail: auth.email,
      metadata: { comparedIds: body.ids, ranking: result.ranking },
    });

    return NextResponse.json({ ok: true, ...result, items: rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[merchandiser/compare]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sammenligning feilet" },
      { status: 500 }
    );
  }
}
