import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  calculatePricingBreakdown,
  isNaturalPrice,
} from "@/lib/import/pricing";
import {
  extractTemuPriceNOKFromUrl,
  isTemuFallbackSupplierCost,
} from "@/lib/scrapers/temu-price";

export const PRICING_AUDIT_QUEUE_KEY = "catalog_pricing_audit_queue";

export type PricingAuditItemStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "flagged";

export type PricingAuditItem = {
  productId: string;
  name: string;
  slug: string;
  supplierName: string | null;
  supplierUrl: string | null;
  /** Price shown / extracted from Temu URL (NOK), when available */
  temuPagePrice: number | null;
  temuPriceSource: string | null;
  shippingEstimate: string | null;
  /** Current DB supplier cost */
  currentSupplierPrice: number | null;
  /** Suggested correct supplier cost (from Temu URL / scrape hint) */
  suggestedSupplierPrice: number | null;
  currentSalePrice: number;
  suggestedSalePrice: number | null;
  oldCompareAtPrice: number | null;
  newCompareAtPrice: number | null;
  inboundShipping: number | null;
  landedCost: number | null;
  expectedMarginPct: number | null;
  markupPct: number | null;
  policy: string | null;
  reason: string;
  missingSupplierCost: boolean;
  usedFallback105: boolean;
  status: PricingAuditItemStatus;
};

export type PricingAuditQueue = {
  generatedAt: string;
  storeId: string | null;
  status: "pending_approval" | "applied" | "empty";
  summary: {
    scanned: number;
    changes: number;
    unchanged: number;
    missingCost: number;
    fallback105: number;
    pending: number;
  };
  items: PricingAuditItem[];
};

function readShippingEstimateFromProduct(product: {
  specs: Prisma.JsonValue | null;
  description: string | null;
  shortDescription: string | null;
}): string | null {
  const specs = product.specs;
  if (specs && typeof specs === "object" && !Array.isArray(specs)) {
    const record = specs as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (/levering|shipping|delivery|frakt/i.test(key) && typeof value === "string") {
        return value;
      }
    }
  }

  const blob = `${product.shortDescription || ""}\n${product.description || ""}`;
  const match = blob.match(
    /(?:leveringstid|estimert levering|shipping|delivery)[:\s]+([^.<\n]{3,80})/i
  );
  return match?.[1]?.trim() || null;
}

/**
 * Audit imported catalog products. Does NOT publish prices — writes an approval queue.
 */
export async function runCatalogPricingAudit(opts?: {
  storeId?: string | null;
  onlyImported?: boolean;
}): Promise<PricingAuditQueue> {
  const storeId = opts?.storeId ?? null;
  const where: Prisma.ProductWhereInput = {
    ...(storeId ? { storeId } : {}),
    ...(opts?.onlyImported === false
      ? {}
      : {
          OR: [
            { supplierName: { not: null } },
            { supplierUrl: { not: null } },
            { supplierProductId: { not: null } },
            { autoImport: true },
          ],
        }),
  };

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      supplierPrice: true,
      supplierName: true,
      supplierUrl: true,
      profitMargin: true,
      specs: true,
      description: true,
      shortDescription: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  const items: PricingAuditItem[] = [];
  let changes = 0;
  let unchanged = 0;
  let missingCost = 0;
  let fallback105 = 0;

  for (const product of products) {
    const shippingEstimate = readShippingEstimateFromProduct(product);
    const urlPrice =
      product.supplierUrl && product.supplierName === "temu"
        ? extractTemuPriceNOKFromUrl(product.supplierUrl)
        : { amountNOK: 0, source: "none" as const };

    const temuPagePrice = urlPrice.amountNOK > 0 ? urlPrice.amountNOK : null;
    const usedFallback105 = isTemuFallbackSupplierCost(product.supplierPrice);
    if (usedFallback105) fallback105 += 1;

    // Suggested supplier cost: prefer live Temu URL price over stored fallback
    let suggestedSupplierPrice: number | null = null;
    if (temuPagePrice != null) {
      suggestedSupplierPrice = temuPagePrice;
    } else if (
      product.supplierPrice != null &&
      product.supplierPrice > 0 &&
      !usedFallback105
    ) {
      suggestedSupplierPrice = product.supplierPrice;
    }

    if (
      suggestedSupplierPrice == null ||
      !Number.isFinite(suggestedSupplierPrice) ||
      suggestedSupplierPrice <= 0
    ) {
      missingCost += 1;
      items.push({
        productId: product.id,
        name: product.name,
        slug: product.slug,
        supplierName: product.supplierName,
        supplierUrl: product.supplierUrl,
        temuPagePrice,
        temuPriceSource: urlPrice.source === "none" ? null : urlPrice.source,
        shippingEstimate,
        currentSupplierPrice: product.supplierPrice,
        suggestedSupplierPrice: null,
        currentSalePrice: product.price,
        suggestedSalePrice: null,
        oldCompareAtPrice: product.compareAtPrice,
        newCompareAtPrice: null,
        inboundShipping: null,
        landedCost: null,
        expectedMarginPct: null,
        markupPct: null,
        policy: null,
        reason: usedFallback105
          ? "DB-leverandørpris er den kjente 9.99 USD→~105 NOK-plassholderen, og Temu-sidepris mangler i URL. Kan ikke foreslå realistisk pris."
          : "Mangler pålitelig leverandørkost (Temu-pris). Ikke publiser før kost er verifisert.",
        missingSupplierCost: true,
        usedFallback105,
        status: "flagged",
      });
      continue;
    }

    const supplierCost = suggestedSupplierPrice;
    const breakdown = calculatePricingBreakdown(supplierCost, {
      shippingEstimate,
      profitMargin: product.profitMargin,
    });

    const supplierNeedsFix =
      usedFallback105 ||
      product.supplierPrice == null ||
      Math.abs((product.supplierPrice ?? 0) - supplierCost) >= 0.5;

    const saleNeedsFix =
      Math.round(breakdown.sellingPrice) !== Math.round(product.price) ||
      !isNaturalPrice(product.price);

    if (!supplierNeedsFix && !saleNeedsFix) {
      unchanged += 1;
      continue;
    }

    changes += 1;
    const reasonParts: string[] = [];
    if (usedFallback105) {
      reasonParts.push(
        `Erstatt falsk leverandørpris ~105 NOK (9.99 USD-fallback) med Temu-pris ${supplierCost} NOK`
      );
    } else if (supplierNeedsFix) {
      reasonParts.push(
        `Oppdater leverandørkost ${product.supplierPrice} → ${supplierCost} NOK`
      );
    }
    reasonParts.push(
      `Foreslått salgspris ${product.price} → ${breakdown.sellingPrice} NOK (${breakdown.policy})`
    );

    items.push({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      supplierName: product.supplierName,
      supplierUrl: product.supplierUrl,
      temuPagePrice,
      temuPriceSource: urlPrice.source === "none" ? null : urlPrice.source,
      shippingEstimate,
      currentSupplierPrice: product.supplierPrice,
      suggestedSupplierPrice: supplierCost,
      currentSalePrice: product.price,
      suggestedSalePrice: breakdown.sellingPrice,
      oldCompareAtPrice: product.compareAtPrice,
      newCompareAtPrice: breakdown.compareAtPrice,
      inboundShipping: breakdown.inboundShipping,
      landedCost: breakdown.landedCost,
      expectedMarginPct: Math.round(breakdown.marginPct * 10) / 10,
      markupPct: Math.round(breakdown.markupPct * 10) / 10,
      policy: breakdown.policy,
      reason: reasonParts.join(". ") + ".",
      missingSupplierCost: false,
      usedFallback105,
      status: "pending",
    });
  }

  items.sort((a, b) => {
    const rank = (s: PricingAuditItemStatus) =>
      s === "pending" ? 0 : s === "flagged" ? 1 : 2;
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    if (a.usedFallback105 !== b.usedFallback105) return a.usedFallback105 ? -1 : 1;
    const da = Math.abs((a.suggestedSalePrice ?? a.currentSalePrice) - a.currentSalePrice);
    const db = Math.abs((b.suggestedSalePrice ?? b.currentSalePrice) - b.currentSalePrice);
    return db - da;
  });

  const queue: PricingAuditQueue = {
    generatedAt: new Date().toISOString(),
    storeId,
    status: items.length === 0 ? "empty" : "pending_approval",
    summary: {
      scanned: products.length,
      changes,
      unchanged,
      missingCost,
      fallback105,
      pending: items.filter((i) => i.status === "pending").length,
    },
    items,
  };

  await prisma.setting.upsert({
    where: { key: PRICING_AUDIT_QUEUE_KEY },
    create: {
      key: PRICING_AUDIT_QUEUE_KEY,
      value: queue as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: queue as unknown as Prisma.InputJsonValue,
    },
  });

  return queue;
}

export async function getPricingAuditQueue(): Promise<PricingAuditQueue | null> {
  const row = await prisma.setting.findUnique({
    where: { key: PRICING_AUDIT_QUEUE_KEY },
  });
  if (!row?.value || typeof row.value !== "object" || Array.isArray(row.value)) {
    return null;
  }
  return row.value as unknown as PricingAuditQueue;
}

async function saveQueue(queue: PricingAuditQueue) {
  await prisma.setting.upsert({
    where: { key: PRICING_AUDIT_QUEUE_KEY },
    create: {
      key: PRICING_AUDIT_QUEUE_KEY,
      value: queue as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: queue as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Apply approved price (+ supplier cost) changes. Never applies flagged items.
 */
export async function applyPricingAuditApprovals(opts: {
  productIds?: string[];
  approveAllPending?: boolean;
}): Promise<{ applied: number; skipped: number }> {
  const queue = await getPricingAuditQueue();
  if (!queue) {
    throw new Error("Ingen pris-revisjonskø funnet. Kjør audit først.");
  }

  const targets = queue.items.filter((item) => {
    if (item.missingSupplierCost || item.suggestedSalePrice == null) return false;
    if (item.suggestedSupplierPrice == null) return false;
    if (opts.approveAllPending) return item.status === "pending";
    if (!opts.productIds?.length) return false;
    return opts.productIds.includes(item.productId) && item.status === "pending";
  });

  let applied = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of targets) {
      if (item.suggestedSalePrice == null || item.suggestedSupplierPrice == null) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: {
          price: item.suggestedSalePrice,
          compareAtPrice: item.newCompareAtPrice,
          supplierPrice: item.suggestedSupplierPrice,
        },
      });
      item.status = "approved";
      applied += 1;
    }
  });

  queue.summary.pending = queue.items.filter((i) => i.status === "pending").length;
  if (queue.summary.pending === 0) {
    queue.status = "applied";
  }
  await saveQueue(queue);

  return { applied, skipped: targets.length - applied };
}

export async function rejectPricingAuditItems(productIds: string[]): Promise<number> {
  const queue = await getPricingAuditQueue();
  if (!queue) {
    throw new Error("Ingen pris-revisjonskø funnet.");
  }
  const idSet = new Set(productIds);
  let rejected = 0;
  for (const item of queue.items) {
    if (idSet.has(item.productId) && item.status === "pending") {
      item.status = "rejected";
      rejected += 1;
    }
  }
  queue.summary.pending = queue.items.filter((i) => i.status === "pending").length;
  await saveQueue(queue);
  return rejected;
}
