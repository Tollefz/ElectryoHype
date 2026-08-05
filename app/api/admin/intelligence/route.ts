import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  buildStoreIntelligence,
  getLatestIntelligenceSnapshot,
  recordCategoryManagerDecision,
  INTELLIGENCE_SIGNAL_PROVIDERS,
} from "@/lib/intelligence";
import { logError } from "@/lib/utils/logger";
import { adminErrorResponse } from "@/lib/admin/api-error";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";
    const preferCached = searchParams.get("cached") === "1" || !refresh;

    if (preferCached && !refresh) {
      const snap = await getLatestIntelligenceSnapshot();
      if (snap) {
        return NextResponse.json({
          ok: true,
          cached: true,
          report: {
            storeHealthScore: snap.storeHealthScore,
            strongestCategory: snap.strongestCategory,
            weakestCategory: snap.weakestCategory,
            bestMarginCategory: snap.bestMarginCategory,
            lowestMarginCategory: snap.lowestMarginCategory,
            categories: snap.categories,
            gaps: snap.gaps,
            complements: snap.complements,
            recommendations: snap.recommendations,
            dailyTasks: snap.dailyTasks,
            supplierMix: snap.supplierMix,
            risks: snap.risks,
            generatedAt: snap.generatedAt,
          },
          signals: INTELLIGENCE_SIGNAL_PROVIDERS.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            status: p.status,
          })),
        });
      }
    }

    const report = await buildStoreIntelligence();
    return NextResponse.json({
      ok: true,
      cached: false,
      report,
      signals: INTELLIGENCE_SIGNAL_PROVIDERS.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        status: p.status,
      })),
    });
  } catch (error) {
    logError(error, "[intelligence:GET]");
    return adminErrorResponse(error, 500, "intelligence:GET");
  }
}

const decisionSchema = z.object({
  decision: z.enum([
    "accept_gap",
    "dismiss_gap",
    "accept_recommendation",
    "dismiss_recommendation",
    "publish",
    "delete_product",
    "edit_product",
    "price_update",
    "strategy_ack",
  ]),
  subjectType: z.string().min(1),
  subjectKey: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = decisionSchema.parse(await req.json());
    await recordCategoryManagerDecision({
      ...body,
      actorId: auth.userId,
      actorEmail: auth.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[intelligence:POST]");
    return NextResponse.json({ ok: false, error: "Kunne ikke lagre" }, { status: 500 });
  }
}
