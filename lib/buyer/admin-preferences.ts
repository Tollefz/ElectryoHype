/**
 * Transparent admin preference rules + thumbs learning (no external ML).
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAiFeedback } from "@/lib/trust/feedback";
import { getOrCreateStoreMemory } from "@/lib/autonomy/memory";
import { DEFAULT_STORE_ID } from "@/lib/store";

export type DislikeReason =
  | "feil_kategori"
  | "darlig_margin"
  | "for_dyr"
  | "lang_levering"
  | "darlig_produkt"
  | "ser_billig_ut"
  | "passer_ikke"
  | "annet";

export const DISLIKE_REASON_LABELS: Record<DislikeReason, string> = {
  feil_kategori: "Feil kategori",
  darlig_margin: "Dårlig margin",
  for_dyr: "For dyr",
  lang_levering: "Lang levering",
  darlig_produkt: "Dårlig produkt",
  ser_billig_ut: "Ser billig ut",
  passer_ikke: "Passer ikke ElectroHype",
  annet: "Annet",
};

export type AdminPreferenceRules = {
  rules: string[];
  updatedAt: string;
};

type MerchSettings = {
  autoQueueEnabled?: boolean;
  autoQueueMinScore?: number;
  defaultBatchSize?: number;
  shelves?: unknown;
  adminPreferenceRules?: string[];
  adminPreferenceUpdatedAt?: string;
};

export async function getPreferenceContext(
  storeId?: string | null
): Promise<{ likes: string[]; dislikes: string[]; rules: string[] }> {
  const [rules, memory] = await Promise.all([
    getAdminPreferenceRules(storeId),
    getOrCreateStoreMemory(storeId),
  ]);
  return {
    likes: memory.likes,
    dislikes: memory.dislikes,
    rules: rules.rules,
  };
}

export async function getAdminPreferenceRules(
  storeId?: string | null
): Promise<AdminPreferenceRules> {
  const profile = storeId
    ? await prisma.shopProfile.findUnique({ where: { storeId } })
    : await prisma.shopProfile.findFirst({ orderBy: { updatedAt: "desc" } });
  const settings = (profile?.merchandiserSettings || {}) as MerchSettings;
  return {
    rules: Array.isArray(settings.adminPreferenceRules)
      ? settings.adminPreferenceRules.map(String).filter(Boolean)
      : [],
    updatedAt: settings.adminPreferenceUpdatedAt || profile?.updatedAt.toISOString() || "",
  };
}

export async function saveAdminPreferenceRules(input: {
  rules: string[];
  storeId?: string | null;
  actorEmail?: string | null;
}): Promise<AdminPreferenceRules> {
  const storeId = input.storeId || DEFAULT_STORE_ID;
  const rules = input.rules
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 40);
  const updatedAt = new Date().toISOString();

  const existing = await prisma.shopProfile.findUnique({ where: { storeId } });
  const prev = (existing?.merchandiserSettings || {}) as MerchSettings;
  const next: MerchSettings = {
    ...prev,
    adminPreferenceRules: rules,
    adminPreferenceUpdatedAt: updatedAt,
  };

  if (existing) {
    await prisma.shopProfile.update({
      where: { id: existing.id },
      data: { merchandiserSettings: next as Prisma.InputJsonValue },
    });
  } else {
    await prisma.shopProfile.create({
      data: {
        storeId,
        name: "ElectroHypeX",
        audience: "Norske kunder som vil ha moderne elektronikk",
        categories: ["Gaming", "Mobil & Tilbehør", "Data & IT"],
        merchandiserSettings: next as Prisma.InputJsonValue,
      },
    });
  }

  await recordAiFeedback({
    storeId,
    engine: "digital_buyer",
    kind: "edit",
    subjectType: "admin_preference_rules",
    subjectKey: storeId,
    humanResult: { rules },
    actorEmail: input.actorEmail,
    why: [`Lagret ${rules.length} butikkregler`],
  });

  return { rules, updatedAt };
}

export async function recordBuyerThumb(input: {
  candidateId: string;
  vote: "up" | "down";
  reasons?: DislikeReason[];
  actorEmail?: string | null;
  storeId?: string | null;
}): Promise<{ ok: true; explanation: string[] }> {
  const candidate = await prisma.buyerCandidate.findUnique({
    where: { id: input.candidateId },
  });
  if (!candidate) {
    throw new Error("Kandidat finnes ikke");
  }

  const snap =
    candidate.snapshot && typeof candidate.snapshot === "object"
      ? (candidate.snapshot as Record<string, unknown>)
      : {};
  const title = candidate.title || String(snap.title || "");
  const category = String(snap.categoryMain || snap.category || "");
  const subcategory = String(snap.subcategory || "");
  const features: string[] = [];
  if (category) features.push(`kategori:${category}`);
  if (subcategory) features.push(`underkategori:${subcategory}`);
  if (title) features.push(`tittel:${title.slice(0, 80)}`);
  try {
    const { resolveProductFamilyIds } = await import(
      "@/lib/buyer/preference-signals"
    );
    for (const fid of resolveProductFamilyIds(title, category).slice(0, 3)) {
      features.push(`family:${fid}`);
    }
  } catch {
    /* optional */
  }
  const tags = Array.isArray(candidate.discoveryTags)
    ? candidate.discoveryTags.map(String)
    : [];
  for (const t of tags.slice(0, 5)) features.push(`tag:${t}`);

  const memory = await getOrCreateStoreMemory(input.storeId);
  let likes = [...memory.likes];
  let dislikes = [...memory.dislikes];
  const explanation: string[] = [];

  if (input.vote === "up") {
    for (const f of features) {
      if (!likes.includes(f)) likes.push(f);
    }
    likes = likes.slice(-80);
    // Soft undo opposite signals for same title
    dislikes = dislikes.filter((d) => !d.includes(title.slice(0, 40)));
    explanation.push("Positiv feedback lagret.");
    explanation.push(
      `Liker-signaler: ${features.slice(0, 3).join(", ") || "generelt"}`
    );
  } else {
    const reasons = input.reasons?.length ? input.reasons : (["annet"] as DislikeReason[]);
    for (const r of reasons) {
      const key = `dislike:${r}:${title.slice(0, 60)}`;
      if (!dislikes.includes(key)) dislikes.push(key);
      explanation.push(`Negativ: ${DISLIKE_REASON_LABELS[r] || r}`);
    }
    if (category) {
      const catKey = `avoid_category_signal:${category}`;
      if (!dislikes.includes(catKey)) dislikes.push(catKey);
    }
    dislikes = dislikes.slice(-100);
    // Soft reduce like for same title
    likes = likes.filter((l) => !l.includes(title.slice(0, 40)));
  }

  await prisma.storeMemory.update({
    where: { id: memory.id },
    data: {
      likes: likes as Prisma.InputJsonValue,
      dislikes: dislikes as Prisma.InputJsonValue,
    },
  });

  await recordAiFeedback({
    storeId: input.storeId,
    engine: "digital_buyer",
    kind: input.vote === "up" ? "approve" : "reject",
    subjectType: "buyer_candidate",
    subjectKey: input.candidateId,
    aiProposal: {
      title,
      shopMatchPct: candidate.shopMatchPct,
      overallScore: candidate.overallScore,
    },
    humanResult: {
      vote: input.vote,
      reasons: input.reasons || [],
      features,
    },
    confidence: candidate.shopMatchPct,
    why: explanation,
    actorEmail: input.actorEmail,
    metadata: { features },
  });

  // Refresh AI Store Memory patterns (additive layer — does not change thumb outcome)
  void import("@/lib/buyer/ai-memory")
    .then((m) => m.rebuildAiMemory({ storeId: input.storeId }))
    .catch(() => undefined);

  return { ok: true, explanation };
}
