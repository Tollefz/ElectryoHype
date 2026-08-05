/**
 * Finance Dashboard — store economics rollups (not full accounting).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getUsdToNokRateSync } from "@/lib/fx/usd-nok";
import {
  estimateStripeFee,
  marginPct,
  profitNok,
  roiPct,
  round2,
  unitSupplierCost,
} from "./finance-math";
import { cleanProductName } from "@/lib/utils/url-decode";

export type FinanceProductRow = {
  productId: string;
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  units: number;
  price: number;
  supplierPrice: number | null;
};

export type FinanceDashboard = {
  rangeDays: number;
  paidOrders: number;
  revenue: number;
  aov: number | null;
  shippingCollected: number;
  supplierCost: number;
  stripeFeesEst: number;
  /** Bruttofortjeneste ≈ revenue − supplierCost */
  grossProfit: number;
  /** Nettofortjeneste (est) ≈ gross − stripe − (adSpend hvis kjent) */
  netProfit: number;
  /** ROI % = grossProfit / supplierCost */
  roi: number | null;
  adSpend: number;
  roas: number | null;
  cpa: number | null;
  /** CAC ≈ adSpend / unique paying customers (fallback: CPA) */
  cac: number | null;
  uniqueCustomers: number;
  fxUsdNok: number;
  fxSource: string;
  highestMargin: FinanceProductRow[];
  lowestMargin: FinanceProductRow[];
  profitable: FinanceProductRow[];
  lossMaking: FinanceProductRow[];
  empty: boolean;
};

export async function getFinanceDashboard(
  rangeDays = 30,
  storeId = DEFAULT_STORE_ID
): Promise<FinanceDashboard> {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  since.setHours(0, 0, 0, 0);

  const fx = getUsdToNokRateSync();

  const [orders, dailyStats, catalog] = await Promise.all([
    prisma.order.findMany({
      where: {
        paymentStatus: "paid",
        archivedAt: null,
        isTestOrder: false,
        createdAt: { gte: since },
        OR: [{ storeId }, { storeId: null }],
      },
      select: {
        total: true,
        shippingCost: true,
        tax: true,
        customerEmail: true,
        customerId: true,
        orderItems: {
          select: {
            quantity: true,
            price: true,
            productId: true,
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                supplierPrice: true,
              },
            },
          },
        },
      },
      take: 3000,
    }),
    prisma.marketingDailyStat.findMany({
      where: {
        storeId,
        day: { gte: since },
      },
      select: { adSpend: true, revenue: true, purchases: true },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [{ storeId }, { storeId: null }],
      },
      select: {
        id: true,
        name: true,
        price: true,
        supplierPrice: true,
        stock: true,
      },
      take: 500,
    }),
  ]);

  let revenue = 0;
  let shippingCollected = 0;
  let supplierCost = 0;
  let stripeFeesEst = 0;
  const customers = new Set<string>();

  type Agg = {
    productId: string;
    name: string;
    revenue: number;
    cost: number;
    units: number;
    price: number;
    supplierPrice: number | null;
  };
  const byProduct = new Map<string, Agg>();

  for (const order of orders) {
    revenue += Number(order.total) || 0;
    shippingCollected += Number(order.shippingCost) || 0;
    stripeFeesEst += estimateStripeFee(Number(order.total) || 0);
    const cust = order.customerId || order.customerEmail;
    if (cust) customers.add(cust);

    for (const item of order.orderItems) {
      const price = Number(item.price) || 0;
      const qty = item.quantity || 1;
      const cost = unitSupplierCost(item.product.supplierPrice, price);
      supplierCost += cost * qty;

      const id = item.productId;
      const row = byProduct.get(id) || {
        productId: id,
        name: cleanProductName(item.product.name),
        revenue: 0,
        cost: 0,
        units: 0,
        price: item.product.price,
        supplierPrice: item.product.supplierPrice,
      };
      row.revenue += price * qty;
      row.cost += cost * qty;
      row.units += qty;
      byProduct.set(id, row);
    }
  }

  const adSpend = round2(
    dailyStats.reduce((s, d) => s + (d.adSpend || 0), 0)
  );
  const grossProfit = round2(revenue - supplierCost);
  const netProfit = round2(grossProfit - stripeFeesEst - adSpend);
  const roi = roiPct(grossProfit, supplierCost);
  const aov =
    orders.length > 0 ? round2(revenue / orders.length) : null;
  const roas = adSpend > 0 ? round2(revenue / adSpend) : null;
  const cpa =
    adSpend > 0 && orders.length > 0
      ? round2(adSpend / orders.length)
      : null;
  const cac =
    adSpend > 0 && customers.size > 0
      ? round2(adSpend / customers.size)
      : cpa;

  const soldRows: FinanceProductRow[] = [...byProduct.values()].map((r) => ({
    productId: r.productId,
    name: r.name,
    revenue: round2(r.revenue),
    cost: round2(r.cost),
    profit: round2(r.revenue - r.cost),
    marginPct: marginPct(r.revenue / Math.max(r.units, 1), r.cost / Math.max(r.units, 1)),
    units: r.units,
    price: r.price,
    supplierPrice: r.supplierPrice,
  }));

  // Catalog margins for products not yet in soldRows (fill high/low margin lists)
  const catalogRows: FinanceProductRow[] = catalog
    .filter((p) => p.supplierPrice != null && p.supplierPrice > 0 && p.price > 0)
    .map((p) => {
      const m = marginPct(p.price, p.supplierPrice);
      const profit = profitNok(p.price, p.supplierPrice, 1) ?? 0;
      return {
        productId: p.id,
        name: cleanProductName(p.name),
        revenue: p.price,
        cost: p.supplierPrice!,
        profit,
        marginPct: m,
        units: 0,
        price: p.price,
        supplierPrice: p.supplierPrice,
      };
    });

  const marginSource =
    soldRows.length >= 3
      ? soldRows.filter((r) => r.marginPct != null)
      : catalogRows.filter((r) => r.marginPct != null);

  const highestMargin = [...marginSource]
    .sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))
    .slice(0, 5);

  const lowestMargin = [...marginSource]
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, 5);

  const profitable = [...soldRows]
    .filter((r) => r.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8);

  const lossMaking = [...soldRows]
    .filter((r) => r.profit < 0 || (r.marginPct != null && r.marginPct < 15))
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 8);

  // Soft-loss: catalog with margin < 20% if no sales losses
  if (lossMaking.length === 0) {
    for (const r of catalogRows
      .filter((x) => x.marginPct != null && x.marginPct < 20)
      .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
      .slice(0, 5)) {
      lossMaking.push({
        ...r,
        profit: r.profit,
      });
    }
  }

  const empty = orders.length === 0 && catalog.length === 0;

  return {
    rangeDays,
    paidOrders: orders.length,
    revenue: round2(revenue),
    aov,
    shippingCollected: round2(shippingCollected),
    supplierCost: round2(supplierCost),
    stripeFeesEst: round2(stripeFeesEst),
    grossProfit,
    netProfit,
    roi,
    adSpend,
    roas,
    cpa,
    cac,
    uniqueCustomers: customers.size,
    fxUsdNok: fx.rate,
    fxSource: fx.source,
    highestMargin,
    lowestMargin,
    profitable,
    lossMaking,
    empty,
  };
}
