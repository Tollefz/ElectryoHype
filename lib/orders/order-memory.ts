/**
 * Order Memory — learns from order history (not Buyer/Marketing memory).
 * Additive learning only. Never refunds or decides for customers.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { matchFamily, familyLabel } from "@/lib/intelligence/families";
import { isErrorPhase, type AutomationPhase } from "./order-state-machine";

export const ORDER_MEMORY_SETTING_KEY = "order_brain_memory";
export const ORDER_MEMORY_NUDGE_MAX = 3;
const LOOKBACK_DAYS = 90;
const STALE_MS = 30 * 60_000;

export type OrderMemorySupplierRef = {
  supplier: string;
  orders: number;
  delayed: number;
  errors: number;
  delivered: number;
  avgShipDays: number | null;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type OrderMemoryFamilyRef = {
  familyId: string;
  label: string;
  orders: number;
  cancelled: number;
  delayed: number;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type OrderMemoryCarrierRef = {
  carrier: string;
  orders: number;
  delayed: number;
  trackingGaps: number;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type OrderMemoryStory = {
  id: string;
  text: string;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type OrderMemorySnapshot = {
  version: 1;
  rebuiltAt: string;
  lookbackDays: number;
  suppliers: OrderMemorySupplierRef[];
  families: OrderMemoryFamilyRef[];
  carriers: OrderMemoryCarrierRef[];
  stories: OrderMemoryStory[];
  stats: {
    ordersSeen: number;
    delayed: number;
    errors: number;
    delivered: number;
    memoryScore: number;
  };
};

type Acc = {
  orders: number;
  delayed: number;
  errors: number;
  delivered: number;
  cancelled: number;
  trackingGaps: number;
  shipDaysSum: number;
  shipDaysN: number;
};

function emptyAcc(): Acc {
  return {
    orders: 0,
    delayed: 0,
    errors: 0,
    delivered: 0,
    cancelled: 0,
    trackingGaps: 0,
    shipDaysSum: 0,
    shipDaysN: 0,
  };
}

function emptySnapshot(): OrderMemorySnapshot {
  return {
    version: 1,
    rebuiltAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    suppliers: [],
    families: [],
    carriers: [],
    stories: [],
    stats: {
      ordersSeen: 0,
      delayed: 0,
      errors: 0,
      delivered: 0,
      memoryScore: 0,
    },
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86400000);
}

function isDelayedOrder(o: {
  automationPhase: string;
  automationPhaseAt: Date | null;
  createdAt: Date;
  trackingNumber: string | null;
  fulfillmentStatus: string;
}): boolean {
  const since = o.automationPhaseAt || o.createdAt;
  const ageDays = daysBetween(since, new Date());
  if (
    (o.automationPhase === "ORDERED" || o.automationPhase === "SENT_TO_CJ") &&
    !o.trackingNumber &&
    ageDays >= 5
  ) {
    return true;
  }
  if (
    (o.automationPhase === "SHIPPED" || o.fulfillmentStatus === "SHIPPED") &&
    ageDays >= 14
  ) {
    return true;
  }
  return false;
}

/**
 * Rebuild Order Memory from paid orders in lookback window.
 */
export async function rebuildOrderMemory(opts?: {
  lookbackDays?: number;
}): Promise<OrderMemorySnapshot> {
  const lookbackDays = opts?.lookbackDays ?? LOOKBACK_DAYS;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const nowIso = new Date().toISOString();

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      archivedAt: null,
      isTestOrder: false,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      createdAt: true,
      automationPhase: true,
      automationPhaseAt: true,
      fulfillmentStatus: true,
      trackingNumber: true,
      shippingCarrier: true,
      updatedAt: true,
      orderItems: {
        select: {
          product: {
            select: {
              name: true,
              category: true,
              supplierName: true,
            },
          },
        },
      },
    },
    take: 2000,
  });

  if (orders.length === 0) {
    const snap = emptySnapshot();
    snap.rebuiltAt = nowIso;
    snap.lookbackDays = lookbackDays;
    await persist(snap);
    return snap;
  }

  const bySupplier = new Map<string, Acc>();
  const byFamily = new Map<string, Acc & { label: string }>();
  const byCarrier = new Map<string, Acc>();

  let delayedTotal = 0;
  let errorsTotal = 0;
  let deliveredTotal = 0;

  for (const o of orders) {
    const delayed = isDelayedOrder(o);
    const error = isErrorPhase(o.automationPhase as AutomationPhase);
    const delivered =
      o.automationPhase === "DELIVERED" ||
      o.automationPhase === "COMPLETED" ||
      o.fulfillmentStatus === "DELIVERED";
    const cancelled =
      o.fulfillmentStatus === "CANCELLED" ||
      o.automationPhase === "PAYMENT_FAILED";
    const trackingGap =
      (o.automationPhase === "ORDERED" ||
        o.fulfillmentStatus === "ORDERED_FROM_SUPPLIER") &&
      !o.trackingNumber;

    if (delayed) delayedTotal += 1;
    if (error) errorsTotal += 1;
    if (delivered) deliveredTotal += 1;

    const shipDays = delivered
      ? daysBetween(o.createdAt, o.automationPhaseAt || o.updatedAt)
      : null;

    const suppliers = new Set<string>();
    for (const item of o.orderItems) {
      const sn = item.product.supplierName || "ukjent";
      suppliers.add(String(sn));
      const fam = matchFamily(item.product.name, item.product.category);
      if (fam) {
        const label = familyLabel(fam);
        let fa = byFamily.get(fam);
        if (!fa) {
          fa = { ...emptyAcc(), label };
          byFamily.set(fam, fa);
        }
        fa.orders += 1;
        if (delayed) fa.delayed += 1;
        if (cancelled) fa.cancelled += 1;
        if (error) fa.errors += 1;
        if (delivered) fa.delivered += 1;
      }
    }

    if (suppliers.size === 0) suppliers.add("ukjent");
    for (const sn of suppliers) {
      let a = bySupplier.get(sn);
      if (!a) {
        a = emptyAcc();
        bySupplier.set(sn, a);
      }
      a.orders += 1;
      if (delayed) a.delayed += 1;
      if (error) a.errors += 1;
      if (delivered) a.delivered += 1;
      if (shipDays != null) {
        a.shipDaysSum += shipDays;
        a.shipDaysN += 1;
      }
    }

    const carrier = (o.shippingCarrier || "").trim() || "(ukjent frakt)";
    let c = byCarrier.get(carrier);
    if (!c) {
      c = emptyAcc();
      byCarrier.set(carrier, c);
    }
    c.orders += 1;
    if (delayed) c.delayed += 1;
    if (trackingGap) c.trackingGaps += 1;
  }

  const suppliers: OrderMemorySupplierRef[] = [...bySupplier.entries()]
    .filter(([, a]) => a.orders >= 2)
    .map(([supplier, a]) => {
      const avgShipDays =
        a.shipDaysN > 0
          ? Math.round((a.shipDaysSum / a.shipDaysN) * 10) / 10
          : null;
      const delayRate = a.orders > 0 ? a.delayed / a.orders : 0;
      const errorRate = a.orders > 0 ? a.errors / a.orders : 0;
      let polarity: OrderMemorySupplierRef["polarity"] = "neutral";
      if (a.orders >= 3 && delayRate <= 0.1 && errorRate <= 0.1 && a.delivered > 0) {
        polarity = "positive";
      } else if (delayRate >= 0.25 || errorRate >= 0.2) {
        polarity = "negative";
      }
      const whyParts: string[] = [
        `${a.orders} ordre`,
        `${a.delayed} forsinket`,
        `${a.errors} feil`,
      ];
      if (avgShipDays != null) whyParts.push(`snitt ${avgShipDays} d til levert`);
      return {
        supplier,
        orders: a.orders,
        delayed: a.delayed,
        errors: a.errors,
        delivered: a.delivered,
        avgShipDays,
        polarity,
        why: whyParts.join(" · "),
      };
    })
    .sort((a, b) => b.orders - a.orders);

  const families: OrderMemoryFamilyRef[] = [...byFamily.entries()]
    .filter(([, a]) => a.orders >= 2)
    .map(([familyId, a]) => {
      const cancelRate = a.orders > 0 ? a.cancelled / a.orders : 0;
      const delayRate = a.orders > 0 ? a.delayed / a.orders : 0;
      let polarity: OrderMemoryFamilyRef["polarity"] = "neutral";
      if (cancelRate >= 0.15 || delayRate >= 0.3) polarity = "negative";
      else if (delayRate <= 0.1 && a.delivered >= 2) polarity = "positive";
      return {
        familyId,
        label: a.label,
        orders: a.orders,
        cancelled: a.cancelled,
        delayed: a.delayed,
        polarity,
        why: `${a.orders} ordre · ${a.delayed} forsinket · ${a.cancelled} kansellert/feilet`,
      };
    })
    .sort((a, b) => b.delayed + b.cancelled - (a.delayed + a.cancelled));

  const carriers: OrderMemoryCarrierRef[] = [...byCarrier.entries()]
    .filter(([name, a]) => a.orders >= 2 && name !== "(ukjent frakt)")
    .map(([carrier, a]) => {
      const delayRate = a.orders > 0 ? a.delayed / a.orders : 0;
      const gapRate = a.orders > 0 ? a.trackingGaps / a.orders : 0;
      let polarity: OrderMemoryCarrierRef["polarity"] = "neutral";
      if (delayRate >= 0.25 || gapRate >= 0.3) polarity = "negative";
      else if (delayRate <= 0.1 && a.orders >= 3) polarity = "positive";
      return {
        carrier,
        orders: a.orders,
        delayed: a.delayed,
        trackingGaps: a.trackingGaps,
        polarity,
        why: `${a.orders} ordre · ${a.delayed} forsinket · ${a.trackingGaps} tracking-avvik`,
      };
    })
    .sort((a, b) => b.delayed - a.delayed);

  const stories: OrderMemoryStory[] = [];
  for (const s of suppliers.filter((x) => x.polarity !== "neutral").slice(0, 6)) {
    stories.push({
      id: `sup-${s.supplier}`,
      text:
        s.polarity === "positive"
          ? `Leverandør ${s.supplier}: rask levering, få problemer.`
          : `Leverandør ${s.supplier}: mange forsinkelser eller feil.`,
      polarity: s.polarity,
      why: s.why,
    });
  }
  for (const f of families.filter((x) => x.polarity === "negative").slice(0, 4)) {
    stories.push({
      id: `fam-${f.familyId}`,
      text: `Produktfamilie ${f.label}: høy retur/kansellering eller forsinkelse.`,
      polarity: "negative",
      why: f.why,
    });
  }
  for (const c of carriers.filter((x) => x.polarity === "negative").slice(0, 3)) {
    stories.push({
      id: `car-${c.carrier}`,
      text: `Frakttype ${c.carrier}: mange avvik.`,
      polarity: "negative",
      why: c.why,
    });
  }

  const memoryScore = clampScore({
    orders: orders.length,
    delayed: delayedTotal,
    errors: errorsTotal,
    delivered: deliveredTotal,
    stories: stories.length,
  });

  const snap: OrderMemorySnapshot = {
    version: 1,
    rebuiltAt: nowIso,
    lookbackDays,
    suppliers: suppliers.slice(0, 20),
    families: families.slice(0, 20),
    carriers: carriers.slice(0, 15),
    stories: stories.slice(0, 12),
    stats: {
      ordersSeen: orders.length,
      delayed: delayedTotal,
      errors: errorsTotal,
      delivered: deliveredTotal,
      memoryScore,
    },
  };

  await persist(snap);
  return snap;
}

function clampScore(input: {
  orders: number;
  delayed: number;
  errors: number;
  delivered: number;
  stories: number;
}): number {
  if (input.orders === 0) return 0;
  let s = 40;
  s += Math.min(25, Math.log10(input.orders + 1) * 12);
  s += Math.min(20, (input.delivered / input.orders) * 25);
  s -= Math.min(25, (input.delayed / input.orders) * 40);
  s -= Math.min(20, (input.errors / input.orders) * 35);
  s += Math.min(10, input.stories);
  return Math.max(0, Math.min(100, Math.round(s)));
}

async function persist(snap: OrderMemorySnapshot): Promise<void> {
  await prisma.setting.upsert({
    where: { key: ORDER_MEMORY_SETTING_KEY },
    create: {
      key: ORDER_MEMORY_SETTING_KEY,
      value: snap as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: snap as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getOrderMemory(opts?: {
  forceRebuild?: boolean;
}): Promise<OrderMemorySnapshot> {
  if (opts?.forceRebuild) return rebuildOrderMemory();

  const row = await prisma.setting.findUnique({
    where: { key: ORDER_MEMORY_SETTING_KEY },
  });
  if (row?.value && typeof row.value === "object") {
    const snap = row.value as unknown as OrderMemorySnapshot;
    const age = Date.now() - new Date(snap.rebuiltAt || 0).getTime();
    if (Number.isFinite(age) && age < STALE_MS && snap.version === 1) {
      return snap;
    }
  }
  return rebuildOrderMemory();
}

/** Small explainable signal for desk ranking (−3..+3). Never auto-acts. */
export function scoreOrderMemoryForSupplier(
  memory: OrderMemorySnapshot,
  supplier: string
): number {
  const row = memory.suppliers.find(
    (s) => s.supplier.toLowerCase() === supplier.toLowerCase()
  );
  if (!row) return 0;
  if (row.polarity === "positive") return ORDER_MEMORY_NUDGE_MAX;
  if (row.polarity === "negative") return -ORDER_MEMORY_NUDGE_MAX;
  return 0;
}

export { isDelayedOrder };
