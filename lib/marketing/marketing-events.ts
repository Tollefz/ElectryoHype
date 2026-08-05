/**
 * Marketing events — first-party ingest (GA4-standard names).
 * Channels receive the same events client-side; this is the learning store.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import type { EcommerceEventName } from "@/lib/analytics/ecommerce";
import type { Prisma } from "@prisma/client";

export type MarketingIngestPayload = {
  event: EcommerceEventName | string;
  sessionId?: string | null;
  path?: string | null;
  productId?: string | null;
  productName?: string | null;
  transactionId?: string | null;
  value?: number | null;
  currency?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  meta?: Record<string, unknown> | null;
  storeId?: string | null;
};

const FUNNEL_EVENTS = new Set([
  "page_view",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase",
  "remove_from_cart",
  "view_item_list",
  "search",
  "refund",
  "view_promotion",
  "select_promotion",
]);

export function dayStartUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function clampEventName(raw: string): string {
  const name = raw.trim().slice(0, 64);
  return FUNNEL_EVENTS.has(name) || name.length > 0 ? name : "unknown";
}

export async function ingestMarketingEvent(
  payload: MarketingIngestPayload
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const event = clampEventName(String(payload.event || ""));
    if (!event || event === "unknown") {
      return { ok: false, error: "invalid_event" };
    }

    const storeId = payload.storeId || DEFAULT_STORE_ID;
    const value =
      typeof payload.value === "number" && Number.isFinite(payload.value)
        ? payload.value
        : null;

    const row = await prisma.marketingEvent.create({
      data: {
        storeId,
        sessionId: payload.sessionId?.slice(0, 128) || null,
        event,
        path: payload.path?.slice(0, 500) || null,
        productId: payload.productId?.slice(0, 64) || null,
        productName: payload.productName?.slice(0, 200) || null,
        transactionId: payload.transactionId?.slice(0, 128) || null,
        value,
        currency: payload.currency || "NOK",
        source: payload.source?.slice(0, 64) || null,
        medium: payload.medium?.slice(0, 64) || null,
        campaign: payload.campaign?.slice(0, 128) || null,
        meta: (payload.meta as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });

    await bumpDailyStat({
      storeId,
      event,
      value: value ?? 0,
      sessionId: payload.sessionId,
    }).catch(() => {});

    return { ok: true, id: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function ingestMarketingEventBatch(
  events: MarketingIngestPayload[]
): Promise<{ accepted: number; rejected: number }> {
  let accepted = 0;
  let rejected = 0;
  for (const ev of events.slice(0, 25)) {
    const result = await ingestMarketingEvent(ev);
    if (result.ok) accepted += 1;
    else rejected += 1;
  }
  return { accepted, rejected };
}

async function bumpDailyStat(input: {
  storeId: string;
  event: string;
  value: number;
  sessionId?: string | null;
}) {
  const day = dayStartUtc();
  const data: Prisma.MarketingDailyStatUpdateInput = {};

  if (input.event === "page_view") data.pageViews = { increment: 1 };
  if (input.event === "view_item") data.viewItem = { increment: 1 };
  if (input.event === "add_to_cart") data.addToCart = { increment: 1 };
  if (input.event === "begin_checkout") data.beginCheckout = { increment: 1 };
  if (input.event === "purchase") {
    data.purchases = { increment: 1 };
    data.revenue = { increment: input.value };
  }
  if (input.event === "page_view" && input.sessionId) {
    data.sessions = { increment: 1 };
  }

  if (Object.keys(data).length === 0) return;

  await prisma.marketingDailyStat.upsert({
    where: {
      storeId_day: { storeId: input.storeId, day },
    },
    create: {
      storeId: input.storeId,
      day,
      pageViews: input.event === "page_view" ? 1 : 0,
      viewItem: input.event === "view_item" ? 1 : 0,
      addToCart: input.event === "add_to_cart" ? 1 : 0,
      beginCheckout: input.event === "begin_checkout" ? 1 : 0,
      purchases: input.event === "purchase" ? 1 : 0,
      revenue: input.event === "purchase" ? input.value : 0,
      sessions: input.event === "page_view" && input.sessionId ? 1 : 0,
    },
    update: data,
  });
}

/** Aggregate raw events into daily stats for a date range (idempotent rebuild). */
export async function reaggregateDailyStats(
  storeId = DEFAULT_STORE_ID,
  rangeDays = 7
): Promise<{ days: number }> {
  const since = dayStartUtc();
  since.setUTCDate(since.getUTCDate() - (rangeDays - 1));

  const events = await prisma.marketingEvent.findMany({
    where: { storeId, createdAt: { gte: since } },
    select: {
      event: true,
      value: true,
      sessionId: true,
      createdAt: true,
    },
  });

  const byDay = new Map<
    string,
    {
      sessions: Set<string>;
      pageViews: number;
      viewItem: number;
      addToCart: number;
      beginCheckout: number;
      purchases: number;
      revenue: number;
    }
  >();

  for (const e of events) {
    const key = e.createdAt.toISOString().slice(0, 10);
    let bucket = byDay.get(key);
    if (!bucket) {
      bucket = {
        sessions: new Set(),
        pageViews: 0,
        viewItem: 0,
        addToCart: 0,
        beginCheckout: 0,
        purchases: 0,
        revenue: 0,
      };
      byDay.set(key, bucket);
    }
    if (e.event === "page_view") {
      bucket.pageViews += 1;
      if (e.sessionId) bucket.sessions.add(e.sessionId);
    }
    if (e.event === "view_item") bucket.viewItem += 1;
    if (e.event === "add_to_cart") bucket.addToCart += 1;
    if (e.event === "begin_checkout") bucket.beginCheckout += 1;
    if (e.event === "purchase") {
      bucket.purchases += 1;
      bucket.revenue += e.value ?? 0;
    }
  }

  for (const [dayKey, b] of byDay) {
    const day = new Date(`${dayKey}T00:00:00.000Z`);
    const existing = await prisma.marketingDailyStat.findUnique({
      where: { storeId_day: { storeId, day } },
    });
    await prisma.marketingDailyStat.upsert({
      where: { storeId_day: { storeId, day } },
      create: {
        storeId,
        day,
        sessions: b.sessions.size,
        pageViews: b.pageViews,
        viewItem: b.viewItem,
        addToCart: b.addToCart,
        beginCheckout: b.beginCheckout,
        purchases: b.purchases,
        revenue: b.revenue,
        adSpend: existing?.adSpend ?? 0,
      },
      update: {
        sessions: b.sessions.size,
        pageViews: b.pageViews,
        viewItem: b.viewItem,
        addToCart: b.addToCart,
        beginCheckout: b.beginCheckout,
        purchases: b.purchases,
        revenue: b.revenue,
      },
    });
  }

  return { days: byDay.size };
}
