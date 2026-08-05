/**
 * SEO Memory — remembers recurring SEO gaps (never auto-writes pages).
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import type { SeoAuditSummary } from "./seo-insights";

export const SEO_MEMORY_SETTING_KEY = "seo_brain_memory";
const STALE_MS = 30 * 60_000;

export type SeoMemoryStory = {
  id: string;
  text: string;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type SeoMemorySnapshot = {
  version: 1;
  storeId: string;
  rebuiltAt: string;
  stories: SeoMemoryStory[];
  lastSummary: SeoAuditSummary | null;
  stats: { memoryScore: number };
};

function empty(storeId: string): SeoMemorySnapshot {
  return {
    version: 1,
    storeId,
    rebuiltAt: new Date().toISOString(),
    stories: [],
    lastSummary: null,
    stats: { memoryScore: 0 },
  };
}

export async function rebuildSeoMemory(
  summary: SeoAuditSummary,
  storeId = DEFAULT_STORE_ID
): Promise<SeoMemorySnapshot> {
  const stories: SeoMemoryStory[] = [];

  if (summary.avgScore >= 75) {
    stories.push({
      id: "healthy",
      text: "Katalog-SEO er generelt sunn.",
      polarity: "positive",
      why: `Snittscore ${summary.avgScore}/100 over ${summary.productCount} sider`,
    });
  } else if (summary.avgScore < 50) {
    stories.push({
      id: "weak",
      text: "Mange produktsider trenger SEO-arbeid.",
      polarity: "negative",
      why: `Snittscore ${summary.avgScore}/100`,
    });
  }

  if (summary.missingMeta > 0) {
    stories.push({
      id: "meta",
      text: `${summary.missingMeta} metadata-mangler på aktive produkter.`,
      polarity: "negative",
      why: "metaTitle / metaDescription tomme",
    });
  }
  if (summary.duplicates > 0) {
    stories.push({
      id: "dup",
      text: "Duplikate meta titles går igjen i katalogen.",
      polarity: "negative",
      why: `${summary.duplicates} treff`,
    });
  }
  if (summary.missingFaq > summary.productCount * 0.5) {
    stories.push({
      id: "faq",
      text: "De fleste produktsider mangler FAQ-signal.",
      polarity: "neutral",
      why: "Opportunity — ikke kritisk blocker",
    });
  }

  const memoryScore = Math.max(
    0,
    Math.min(
      100,
      summary.avgScore -
        Math.min(20, summary.criticalCount) +
        (summary.productCount > 0 ? 5 : 0)
    )
  );

  const snap: SeoMemorySnapshot = {
    version: 1,
    storeId,
    rebuiltAt: new Date().toISOString(),
    stories: stories.slice(0, 10),
    lastSummary: summary,
    stats: { memoryScore },
  };

  await prisma.setting.upsert({
    where: { key: SEO_MEMORY_SETTING_KEY },
    create: {
      key: SEO_MEMORY_SETTING_KEY,
      value: snap as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: snap as unknown as Prisma.InputJsonValue,
    },
  });

  return snap;
}

export async function getSeoMemory(opts?: {
  storeId?: string;
}): Promise<SeoMemorySnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const row = await prisma.setting.findUnique({
    where: { key: SEO_MEMORY_SETTING_KEY },
  });
  if (row?.value && typeof row.value === "object") {
    const snap = row.value as unknown as SeoMemorySnapshot;
    const age = Date.now() - new Date(snap.rebuiltAt || 0).getTime();
    if (Number.isFinite(age) && age < STALE_MS && snap.version === 1) {
      return snap;
    }
  }
  return empty(storeId);
}
