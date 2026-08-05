/**
 * Customer Memory — learns store-wide customer patterns.
 * Additive only. Never emails or auto-segments in CRM tools.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import {
  CUSTOMER_SEGMENT_LABELS,
  type CustomerSegmentId,
} from "./customer-segments";
import type { CustomerProfile } from "./customer-score";

export const CUSTOMER_MEMORY_SETTING_KEY = "customer_brain_memory";
const STALE_MS = 30 * 60_000;

export type CustomerMemoryStory = {
  id: string;
  text: string;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type CustomerMemorySnapshot = {
  version: 1;
  storeId: string;
  rebuiltAt: string;
  stories: CustomerMemoryStory[];
  topSegments: Array<{ id: CustomerSegmentId; label: string; customers: number }>;
  stats: {
    memoryScore: number;
    customersScored: number;
    vip: number;
    churnRisk: number;
    returning: number;
  };
};

function empty(storeId: string): CustomerMemorySnapshot {
  return {
    version: 1,
    storeId,
    rebuiltAt: new Date().toISOString(),
    stories: [],
    topSegments: [],
    stats: {
      memoryScore: 0,
      customersScored: 0,
      vip: 0,
      churnRisk: 0,
      returning: 0,
    },
  };
}

export async function rebuildCustomerMemory(
  profiles: CustomerProfile[],
  storeId = DEFAULT_STORE_ID
): Promise<CustomerMemorySnapshot> {
  const nowIso = new Date().toISOString();
  if (profiles.length === 0) {
    const snap = empty(storeId);
    snap.rebuiltAt = nowIso;
    await persist(snap);
    return snap;
  }

  const segCount = new Map<CustomerSegmentId, number>();
  let vip = 0;
  let churnRisk = 0;
  let returning = 0;
  let highLtv = 0;

  for (const p of profiles) {
    if (p.cohort === "vip") vip += 1;
    if (p.cohort === "churn_risk") churnRisk += 1;
    if (
      p.cohort === "returning" ||
      p.cohort === "vip" ||
      p.cohort === "high_ltv"
    ) {
      returning += 1;
    }
    if (p.score.lifetimeValue >= 1500) highLtv += 1;
    for (const s of p.segments.slice(0, 2)) {
      segCount.set(s.id, (segCount.get(s.id) || 0) + 1);
    }
  }

  const topSegments = [...segCount.entries()]
    .map(([id, customers]) => ({
      id,
      label: CUSTOMER_SEGMENT_LABELS[id],
      customers,
    }))
    .sort((a, b) => b.customers - a.customers)
    .slice(0, 8);

  const stories: CustomerMemoryStory[] = [];
  if (topSegments[0]) {
    stories.push({
      id: `seg-${topSegments[0].id}`,
      text: `${topSegments[0].label} er det vanligste kundesegmentet.`,
      polarity: "positive",
      why: `${topSegments[0].customers} kunder med treff i kjøpshistorikk`,
    });
  }
  if (vip > 0) {
    stories.push({
      id: "vip",
      text: `${vip} VIP-kunder med høy verdi eller frekvens.`,
      polarity: "positive",
      why: "VIP = høy LTV (≥2500) eller ≥4 ordre med god score",
    });
  }
  if (churnRisk > 0) {
    stories.push({
      id: "churn",
      text: `${churnRisk} kunder har churn-risiko.`,
      polarity: "negative",
      why: "≥2 kjøp og 90+ dager siden siste ordre",
    });
  }
  if (highLtv > 0) {
    stories.push({
      id: "ltv",
      text: `${highLtv} kunder har høy livstidsverdi.`,
      polarity: "positive",
      why: "LTV ≥ 1500 kr fra betalte ordre",
    });
  }

  const sample = profiles.find(
    (p) => p.recommendation.shouldGet.length > 0 && p.score.orderCount >= 2
  );
  if (sample) {
    const avoid =
      sample.recommendation.avoid[0] != null
        ? `, ikke ${sample.recommendation.avoid[0].toLowerCase()}`
        : "";
    stories.push({
      id: `rec-${sample.customerId}`,
      text: `Kunde bør få ${sample.recommendation.shouldGet
        .map((s) => s.toLowerCase())
        .join(" / ")}${avoid}.`,
      polarity: "neutral",
      why: `${sample.email} — ${sample.recommendation.why}`,
    });
  }

  const memoryScore = Math.max(
    0,
    Math.min(
      100,
      30 +
        Math.min(30, Math.log10(profiles.length + 1) * 15) +
        Math.min(20, topSegments.length * 4) +
        Math.min(15, vip * 3) -
        Math.min(20, churnRisk * 2)
    )
  );

  const snap: CustomerMemorySnapshot = {
    version: 1,
    storeId,
    rebuiltAt: nowIso,
    stories: stories.slice(0, 12),
    topSegments,
    stats: {
      memoryScore,
      customersScored: profiles.length,
      vip,
      churnRisk,
      returning,
    },
  };
  await persist(snap);
  return snap;
}

async function persist(snap: CustomerMemorySnapshot): Promise<void> {
  await prisma.setting.upsert({
    where: { key: CUSTOMER_MEMORY_SETTING_KEY },
    create: {
      key: CUSTOMER_MEMORY_SETTING_KEY,
      value: snap as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: snap as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getCustomerMemory(opts?: {
  forceRebuild?: boolean;
  profiles?: CustomerProfile[];
  storeId?: string;
}): Promise<CustomerMemorySnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  if (opts?.forceRebuild && opts.profiles) {
    return rebuildCustomerMemory(opts.profiles, storeId);
  }
  const row = await prisma.setting.findUnique({
    where: { key: CUSTOMER_MEMORY_SETTING_KEY },
  });
  if (row?.value && typeof row.value === "object" && !opts?.forceRebuild) {
    const snap = row.value as unknown as CustomerMemorySnapshot;
    const age = Date.now() - new Date(snap.rebuiltAt || 0).getTime();
    if (Number.isFinite(age) && age < STALE_MS && snap.version === 1) {
      return snap;
    }
  }
  if (opts?.profiles) {
    return rebuildCustomerMemory(opts.profiles, storeId);
  }
  return empty(storeId);
}
