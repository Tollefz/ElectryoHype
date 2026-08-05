/**
 * Preference learning from admin decisions (merchandiser + category manager).
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export type PreferenceModel = {
  gaming: number;
  premium: number;
  manyImages: number;
  knownBrands: number;
  budget: number;
  accessories: number;
  updatedAt: string;
  sampleSize: number;
};

const DEFAULT_PREFS: Omit<PreferenceModel, "updatedAt" | "sampleSize"> = {
  gaming: 0.5,
  premium: 0.5,
  manyImages: 0.5,
  knownBrands: 0.5,
  budget: 0.4,
  accessories: 0.5,
};

function bump(model: PreferenceModel, key: keyof typeof DEFAULT_PREFS, delta: number) {
  model[key] = Math.max(0, Math.min(1, model[key] + delta));
}

/** Build preference weights from recent accept/reject decisions. */
export async function buildPreferenceModel(storeId?: string | null): Promise<PreferenceModel> {
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [merch, cat] = await Promise.all([
    prisma.merchandiserDecision.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        recommendation: {
          select: {
            shelf: true,
            categoryHint: true,
            overallScore: true,
            pricing: true,
            visual: true,
            reasons: true,
            title: true,
          },
        },
      },
    }),
    prisma.categoryManagerDecision.findMany({
      where: {
        createdAt: { gte: since },
        ...(storeId ? { storeId } : {}),
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const model: PreferenceModel = {
    ...DEFAULT_PREFS,
    updatedAt: new Date().toISOString(),
    sampleSize: merch.length + cat.length,
  };

  for (const d of merch) {
    const positive = d.decision === "accept" || d.decision === "queue" || d.decision === "publish";
    const negative = d.decision === "reject" || d.decision === "dismiss";
    if (!positive && !negative) continue;
    const delta = positive ? 0.04 : -0.03;
    const rec = d.recommendation;
    const text = `${rec?.title || ""} ${rec?.categoryHint || ""} ${rec?.shelf || ""}`.toLowerCase();
    if (/gaming|spill/.test(text)) bump(model, "gaming", delta);
    if (/mobil|case|deksel|pad|hub|accessory|tilbehør/.test(text)) bump(model, "accessories", delta);
    const pricing = rec?.pricing as { premiumPotential?: boolean; estimatedRetailNOK?: number } | null;
    if (pricing?.premiumPotential || (pricing?.estimatedRetailNOK || 0) > 799) {
      bump(model, "premium", delta);
    }
    if ((pricing?.estimatedRetailNOK || 0) < 199) bump(model, "budget", delta);
    const visual = rec?.visual as { premiumFeel?: number } | null;
    if ((visual?.premiumFeel || 0) >= 70) bump(model, "manyImages", delta);
    if (/logitech|razer|sony|samsung|anker|ugreen|apple/i.test(text)) {
      bump(model, "knownBrands", delta);
    }
  }

  for (const d of cat) {
    const positive =
      d.decision === "accept_gap" ||
      d.decision === "accept_recommendation" ||
      d.decision === "publish";
    const negative =
      d.decision === "dismiss_gap" || d.decision === "dismiss_recommendation";
    if (!positive && !negative) continue;
    const delta = positive ? 0.03 : -0.02;
    const key = `${d.subjectType} ${d.subjectKey}`.toLowerCase();
    if (/gaming|mouse|headset|keyboard/.test(key)) bump(model, "gaming", delta);
    if (/pad|hub|case|accessory|complement/.test(key)) bump(model, "accessories", delta);
    if (/premium/.test(key)) bump(model, "premium", delta);
  }

  return model;
}

export async function recordCategoryManagerDecision(input: {
  storeId?: string | null;
  decision:
    | "accept_gap"
    | "dismiss_gap"
    | "accept_recommendation"
    | "dismiss_recommendation"
    | "publish"
    | "delete_product"
    | "edit_product"
    | "price_update"
    | "strategy_ack";
  subjectType: string;
  subjectKey: string;
  reason?: string;
  actorId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const row = await prisma.categoryManagerDecision.create({
    data: {
      storeId: input.storeId || null,
      decision: input.decision,
      subjectType: input.subjectType,
      subjectKey: input.subjectKey,
      reason: input.reason || null,
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
      metadata: input.metadata || undefined,
    },
  });

  try {
    const { recordAiFeedback, recordAiOverride } = await import("@/lib/trust/feedback");
    const kind =
      input.decision.startsWith("accept") || input.decision === "publish"
        ? "approve"
        : input.decision.startsWith("dismiss") || input.decision === "delete_product"
          ? "dismiss"
          : input.decision === "price_update"
            ? "price_change"
            : input.decision === "edit_product"
              ? "edit"
              : "approve";

    await recordAiFeedback({
      storeId: input.storeId,
      engine: "store_intelligence",
      kind,
      subjectType: input.subjectType,
      subjectKey: input.subjectKey,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      metadata: input.metadata || undefined,
    });

    const meta = input.metadata || {};
    if (
      typeof meta.aiValue === "string" &&
      typeof meta.humanValue === "string" &&
      meta.aiValue !== meta.humanValue
    ) {
      await recordAiOverride({
        storeId: input.storeId,
        engine: "store_intelligence",
        field: String(meta.field || input.subjectType),
        subjectKey: input.subjectKey,
        aiValue: meta.aiValue,
        humanValue: meta.humanValue,
        reason: input.reason,
        actorId: input.actorId,
        actorEmail: input.actorEmail,
      });
    }
  } catch {
    /* trust layer optional */
  }

  return row;
}
