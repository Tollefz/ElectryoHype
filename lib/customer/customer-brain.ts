/**
 * Customer Brain / AI CRM — understand customers, not just orders.
 * Profiles + Mission Control. Recommendations only — never auto-emails.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import { getLanguageProfile } from "@/lib/communication/language-profile";
import {
  computeCustomerScore,
  type CustomerProfile,
} from "./customer-score";
import {
  getCustomerMemory,
  rebuildCustomerMemory,
  type CustomerMemorySnapshot,
} from "./customer-memory";
import {
  buildCustomerInsights,
  type CustomerInsight,
} from "./customer-insights";

export type CustomerBrainSnapshot = {
  generatedAt: string;
  storeId: string;
  profiles: CustomerProfile[];
  memory: CustomerMemorySnapshot;
  insights: CustomerInsight[];
  mission: {
    newCustomers: CustomerProfile[];
    returning: CustomerProfile[];
    vip: CustomerProfile[];
    churnRisk: CustomerProfile[];
    highLtv: CustomerProfile[];
  };
  recommendations: Array<{
    customerId: string;
    email: string;
    persona: string | null;
    language: string | null;
    favoriteCategory: string | null;
    shouldGet: string[];
    avoid: string[];
    why: string;
    headline: string;
    actionRequired: true;
  }>;
};

async function sourcesForOrderNumbers(
  orderNumbers: string[],
  storeId: string
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const nums = orderNumbers.filter(Boolean).slice(0, 80);
  if (nums.length === 0) return out;
  try {
    const events = await prisma.marketingEvent.findMany({
      where: {
        transactionId: { in: nums },
        OR: [{ storeId }, { storeId: null }],
        source: { not: null },
      },
      select: { transactionId: true, source: true },
      take: 200,
    });
    for (const e of events) {
      const tid = e.transactionId || "";
      const src = (e.source || "").trim();
      if (!tid || !src) continue;
      const list = out.get(tid) || [];
      if (!list.includes(src)) list.push(src);
      out.set(tid, list);
    }
  } catch {
    /* marketing table optional */
  }
  return out;
}

/**
 * Load customers with orders and build full CRM snapshot.
 */
export async function advanceCustomerBrain(opts?: {
  storeId?: string;
  limit?: number;
}): Promise<CustomerBrainSnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const limit = opts?.limit ?? 200;

  const customers = await prisma.customer.findMany({
    where: {
      OR: [{ storeId }, { storeId: null }],
    },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      orders: {
        where: {
          archivedAt: null,
          isTestOrder: false,
          paymentStatus: { in: ["paid", "refunded"] },
        },
        select: {
          orderNumber: true,
          total: true,
          createdAt: true,
          paymentStatus: true,
          orderItems: {
            select: {
              product: {
                select: { name: true, category: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  const allOrderNumbers = customers.flatMap((c) =>
    c.orders.map((o) => o.orderNumber).filter(Boolean)
  );
  const sourceByOrder = await sourcesForOrderNumbers(allOrderNumbers, storeId);

  const profiles: CustomerProfile[] = [];

  for (const c of customers) {
    if (c.orders.length === 0) continue;
    const sources = [
      ...new Set(
        c.orders.flatMap((o) => sourceByOrder.get(o.orderNumber) || [])
      ),
    ];
    const locale = c.locale || null;
    const language = locale
      ? getLanguageProfile(locale).displayName
      : null;

    const profile = computeCustomerScore({
      customerId: c.id,
      email: c.email,
      name: c.name,
      locale,
      language,
      sources,
      orders: c.orders.map((o) => ({
        orderNumber: o.orderNumber,
        total: Number(o.total) || 0,
        createdAt: o.createdAt,
        paymentStatus: o.paymentStatus,
        titles: o.orderItems.map((i) => cleanProductName(i.product.name)),
        categories: o.orderItems.map((i) => i.product.category),
      })),
    });
    profiles.push(profile);
  }

  if (profiles.length < 20) {
    const orphans = await prisma.order.findMany({
      where: {
        paymentStatus: { in: ["paid", "refunded"] },
        archivedAt: null,
        isTestOrder: false,
        customerId: null,
        customerEmail: { not: null },
        OR: [{ storeId }, { storeId: null }],
      },
      select: {
        orderNumber: true,
        customerEmail: true,
        total: true,
        createdAt: true,
        paymentStatus: true,
        orderItems: {
          select: {
            product: { select: { name: true, category: true } },
          },
        },
      },
      take: 150,
    });
    const orphanSources = await sourcesForOrderNumbers(
      orphans.map((o) => o.orderNumber),
      storeId
    );
    const byEmail = new Map<string, typeof orphans>();
    for (const o of orphans) {
      const email = (o.customerEmail || "").toLowerCase();
      if (!email) continue;
      if (profiles.some((p) => p.email.toLowerCase() === email)) continue;
      const list = byEmail.get(email) || [];
      list.push(o);
      byEmail.set(email, list);
    }
    for (const [email, orders] of byEmail) {
      const sources = [
        ...new Set(
          orders.flatMap((o) => orphanSources.get(o.orderNumber) || [])
        ),
      ];
      profiles.push(
        computeCustomerScore({
          customerId: `email:${email}`,
          email,
          name: null,
          locale: null,
          language: null,
          sources,
          orders: orders.map((o) => ({
            orderNumber: o.orderNumber,
            total: Number(o.total) || 0,
            createdAt: o.createdAt,
            paymentStatus: o.paymentStatus,
            titles: o.orderItems.map((i) => cleanProductName(i.product.name)),
            categories: o.orderItems.map((i) => i.product.category),
          })),
        })
      );
    }
  }

  profiles.sort((a, b) => b.score.lifetimeValue - a.score.lifetimeValue);

  const memory = await rebuildCustomerMemory(profiles, storeId);
  const insights = buildCustomerInsights(profiles, memory);

  const mission = {
    newCustomers: profiles
      .filter((p) => p.cohort === "new" || p.score.orderCount === 1)
      .slice(0, 12),
    returning: profiles
      .filter((p) => p.score.orderCount >= 2)
      .slice(0, 12),
    vip: profiles.filter((p) => p.cohort === "vip").slice(0, 12),
    churnRisk: profiles.filter((p) => p.cohort === "churn_risk").slice(0, 12),
    highLtv: profiles
      .filter(
        (p) => p.cohort === "high_ltv" || p.score.lifetimeValue >= 1500
      )
      .slice(0, 12),
  };

  const recommendations = profiles
    .filter((p) => p.recommendation.shouldGet.length > 0)
    .slice(0, 15)
    .map((p) => ({
      customerId: p.customerId,
      email: p.email,
      persona: p.persona,
      language: p.language,
      favoriteCategory: p.favoriteCategory,
      shouldGet: p.recommendation.shouldGet,
      avoid: p.recommendation.avoid,
      why: p.recommendation.why,
      headline: p.recommendation.headline,
      actionRequired: true as const,
    }));

  return {
    generatedAt: new Date().toISOString(),
    storeId,
    profiles: profiles.slice(0, 100),
    memory,
    insights,
    mission,
    recommendations,
  };
}

export async function getCustomerBrain(opts?: {
  storeId?: string;
  force?: boolean;
}): Promise<CustomerBrainSnapshot> {
  return advanceCustomerBrain({ storeId: opts?.storeId });
}

export async function getCustomerMemoryCached(
  storeId = DEFAULT_STORE_ID
): Promise<CustomerMemorySnapshot> {
  return getCustomerMemory({ storeId });
}
