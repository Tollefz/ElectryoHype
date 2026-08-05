import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  buildEngineScorecards,
  buildStoreAiKpis,
  runAiSelfEvaluation,
  getLatestSelfEval,
  listRecentOverrides,
  listRecentFeedback,
  recordAiOverride,
  recordAiFeedback,
  buildTrustExplanation,
} from "@/lib/trust";
import { logError } from "@/lib/utils/logger";
import { adminErrorResponse } from "@/lib/admin/api-error";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(7, Number(searchParams.get("days") || 30)));

    const [scorecards, kpis, selfEval, overrides, feedback] = await Promise.all([
      buildEngineScorecards(days),
      buildStoreAiKpis(),
      getLatestSelfEval(),
      listRecentOverrides(25),
      listRecentFeedback(30),
    ]);

    return NextResponse.json({
      ok: true,
      days,
      scorecards,
      kpis,
      selfEval,
      overrides,
      feedback,
    });
  } catch (error) {
    logError(error, "[trust:GET]");
    return adminErrorResponse(error, 500, "trust:GET");
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("self_eval"), days: z.number().min(7).max(90).optional() }),
  z.object({
    action: z.literal("record_override"),
    engine: z.enum([
      "supplier",
      "merchandiser",
      "digital_buyer",
      "store_intelligence",
      "pricing",
      "seo",
      "quality_gate",
      "autonomy",
    ]),
    field: z.string().min(1),
    subjectKey: z.string().min(1),
    aiValue: z.string(),
    humanValue: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("record_feedback"),
    engine: z.enum([
      "supplier",
      "merchandiser",
      "digital_buyer",
      "store_intelligence",
      "pricing",
      "seo",
      "quality_gate",
      "autonomy",
    ]),
    kind: z.enum([
      "approve",
      "reject",
      "dismiss",
      "edit",
      "price_change",
      "category_change",
      "seo_change",
      "publish",
      "queue",
      "override",
    ]),
    subjectType: z.string(),
    subjectKey: z.string(),
    aiProposal: z.record(z.string(), z.unknown()).optional(),
    humanResult: z.record(z.string(), z.unknown()).optional(),
    confidence: z.number().optional(),
  }),
  z.object({
    action: z.literal("explain"),
    why: z.array(z.string()).optional(),
    reasons: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    confidence: z.number().optional(),
    explanation: z.string().optional(),
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = postSchema.parse(await req.json());

    if (body.action === "self_eval") {
      const result = await runAiSelfEvaluation({ days: body.days ?? 7 });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "record_override") {
      const row = await recordAiOverride({
        ...body,
        actorId: auth.userId,
        actorEmail: auth.email,
      });
      return NextResponse.json({ ok: true, override: row });
    }

    if (body.action === "record_feedback") {
      const row = await recordAiFeedback({
        ...body,
        actorId: auth.userId,
        actorEmail: auth.email,
      });
      return NextResponse.json({ ok: true, feedback: row });
    }

    if (body.action === "explain") {
      return NextResponse.json({
        ok: true,
        explanation: buildTrustExplanation(body),
      });
    }

    return NextResponse.json({ ok: false, error: "Ukjent action" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[trust:POST]");
    return adminErrorResponse(error, 500, "trust:POST");
  }
}
