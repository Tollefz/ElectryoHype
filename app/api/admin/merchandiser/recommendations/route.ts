import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  listMerchandiserRecommendations,
  getMerchandiserSummary,
  MERCHANDISER_SHELVES,
} from "@/lib/suppliers/merchandiser";
import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser";
import { logError } from "@/lib/utils/logger";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("summary") === "1") {
      const summary = await getMerchandiserSummary();
      return NextResponse.json({ ok: true, summary, shelves: MERCHANDISER_SHELVES });
    }

    const shelf = (searchParams.get("shelf") || "all") as MerchandiserShelf | "all";
    const status = (searchParams.get("status") || "all") as
      | "suggested"
      | "accepted"
      | "rejected"
      | "queued"
      | "imported"
      | "dismissed"
      | "all";
    const minScore = searchParams.get("minScore")
      ? Number(searchParams.get("minScore"))
      : undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;

    const items = await listMerchandiserRecommendations({
      shelf,
      status,
      minScore,
      limit,
    });

    return NextResponse.json({
      ok: true,
      items,
      shelves: MERCHANDISER_SHELVES,
    });
  } catch (error) {
    logError(error, "[merchandiser/recommendations:GET]");
    return NextResponse.json({ ok: false, error: "Kunne ikke hente anbefalinger" }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("queue"),
    ids: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    action: z.literal("decide"),
    id: z.string().min(1),
    decision: z.enum(["accept", "reject", "dismiss"]),
    reason: z.string().optional(),
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = actionSchema.parse(await req.json());
    if (body.action === "queue") {
      const { queueRecommendationsToImport } = await import(
        "@/lib/suppliers/merchandiser/actions"
      );
      const results = await queueRecommendationsToImport({
        ids: body.ids,
        actorId: auth.userId,
        actorEmail: auth.email,
      });
      const okCount = results.filter((r) => r.ok).length;
      return NextResponse.json({
        ok: true,
        results,
        message: `${okCount} lagt i importkø`,
      });
    }

    const { decideOnRecommendation } = await import(
      "@/lib/suppliers/merchandiser/actions"
    );
    const row = await decideOnRecommendation({
      id: body.id,
      decision: body.decision,
      reason: body.reason,
      actorId: auth.userId,
      actorEmail: auth.email,
    });
    return NextResponse.json({ ok: true, item: row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[merchandiser/recommendations:POST]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Handling feilet" },
      { status: 500 }
    );
  }
}
