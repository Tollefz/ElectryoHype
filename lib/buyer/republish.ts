/**
 * Republish existing BuyerCandidates — no discovery / ranking / AI scoring.
 * Reuses approveAndPublishCandidates via buyer_republish_job (same worker drain).
 */

import "server-only";

import type { Prisma, SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateAutoPublishGate } from "@/lib/buyer/auto-publish-gate";
import { classifyBuyerCandidate } from "@/lib/buyer/classify-candidate";
import { parseEconomicFromPricing } from "@/lib/buyer/economic-validation";
import { estimateMerchandiserPricing } from "@/lib/suppliers/merchandiser/pricing-advice";
import {
  startBuyerPublishJobFromIds,
  getBuyerPublishJob,
  type BuyerPublishJobSnapshot,
} from "@/lib/buyer/publish-job";

export type RepublishRowStatus =
  | "ready"
  | "fail_margin"
  | "fail_freight"
  | "fail_pricing"
  | "fail_quality"
  | "published";

/** Fine-grained gate reason — used by diagnostics (not only UI badges). */
export type RepublishGateReason =
  | "ready"
  | "pricing_missing"
  | "freight_gate"
  | "margin_gate"
  | "price_drift"
  | "econ_confidence"
  | "missing_media"
  | "missing_import_link"
  | "assortment"
  | "extreme_margin"
  | "variant"
  | "already_published"
  | "supplier_invalid"
  | "other";

export type RepublishCandidateRow = {
  id: string;
  title: string;
  imageUrl: string | null;
  supplier: string;
  supplierProductId: string;
  category: string;
  group: string;
  landedCostNOK: number | null;
  retailNOK: number | null;
  marginPct: number | null;
  status: RepublishRowStatus;
  statusLabel: string;
  gateReason: RepublishGateReason;
  gateReasonLabel: string;
  gateProblems: string[];
  updatedAt: string;
};

export type RepublishBoardSummary = {
  ready: number;
  failGate: number;
  published: number;
  total: number;
  /** Among failGate: missing NOK pricing fields */
  failPricing: number;
  failMargin: number;
  failFreight: number;
  failQuality: number;
  /** Candidates that had full pricing after classify (for green alert) */
  pricingOk: number;
  scopedToPublishJob: boolean;
  /** Exact gate reason counts (sum of non-ready = failGate + published for already_published) */
  gateReasons: Record<RepublishGateReason, number>;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pricingFields(pricing: unknown): {
  costNOK: number | null;
  shippingNOK: number | null;
  landedCostNOK: number | null;
  retailNOK: number | null;
  marginPct: number | null;
  economicConfidence: number | null;
  flags: string[];
} {
  const p =
    pricing && typeof pricing === "object"
      ? (pricing as Record<string, unknown>)
      : {};
  const economic = parseEconomicFromPricing(pricing);
  const flags = Array.isArray(economic?.flags)
    ? economic!.flags.map(String)
    : [];
  const costNOK = num(economic?.costNOK) ?? num(p.costNOK);
  const shippingNOK = num(economic?.shippingNOK) ?? num(p.shippingNOK);
  const landedCostNOK =
    num(economic?.landedCostNOK) ?? num(p.landedCostNOK);
  const retailNOK =
    num(economic?.retailNOK) ??
    num(p.retailNOK) ??
    num(p.estimatedRetailNOK);
  const marginPct =
    num(economic?.marginPct) ??
    num(p.marginPct) ??
    num(p.estimatedMarginPct);
  const economicConfidence =
    num(economic?.confidence) ?? num(p.economicConfidence);
  return {
    costNOK,
    shippingNOK,
    landedCostNOK,
    retailNOK,
    marginPct,
    economicConfidence,
    flags,
  };
}

function hasFullPricing(fields: ReturnType<typeof pricingFields>): boolean {
  return (
    fields.costNOK != null &&
    fields.costNOK > 0 &&
    fields.landedCostNOK != null &&
    fields.landedCostNOK > 0 &&
    fields.retailNOK != null &&
    fields.retailNOK > 0
  );
}

function statusLabel(s: RepublishRowStatus): string {
  switch (s) {
    case "ready":
      return "Klar for republisering";
    case "fail_margin":
      return "Feiler margin";
    case "fail_freight":
      return "Feiler frakt";
    case "fail_pricing":
      return "Feiler pricing";
    case "fail_quality":
      return "Feiler Quality Gate";
    case "published":
      return "Publisert";
  }
}

function gateReasonLabel(r: RepublishGateReason): string {
  switch (r) {
    case "ready":
      return "Klar";
    case "pricing_missing":
      return "Pricing mangler";
    case "freight_gate":
      return "Freight gate";
    case "margin_gate":
      return "Margin gate";
    case "price_drift":
      return "Price drift";
    case "econ_confidence":
      return "Økonomisk sikkerhet < 90%";
    case "missing_media":
      return "Mangler bilder";
    case "missing_import_link":
      return "Mangler importkobling";
    case "assortment":
      return "Passer ikke sortiment";
    case "extreme_margin":
      return "Ekstrem margin";
    case "variant":
      return "Variantstruktur";
    case "already_published":
      return "Allerede publisert";
    case "supplier_invalid":
      return "Ugyldig leverandørpris";
    case "other":
      return "Annet";
  }
}

function emptyGateReasons(): Record<RepublishGateReason, number> {
  return {
    ready: 0,
    pricing_missing: 0,
    freight_gate: 0,
    margin_gate: 0,
    price_drift: 0,
    econ_confidence: 0,
    missing_media: 0,
    missing_import_link: 0,
    assortment: 0,
    extreme_margin: 0,
    variant: 0,
    already_published: 0,
    supplier_invalid: 0,
    other: 0,
  };
}

function statusFromGateReason(reason: RepublishGateReason): RepublishRowStatus {
  switch (reason) {
    case "ready":
      return "ready";
    case "already_published":
      return "published";
    case "pricing_missing":
    case "supplier_invalid":
      return "fail_pricing";
    case "freight_gate":
      return "fail_freight";
    case "margin_gate":
    case "extreme_margin":
    case "econ_confidence":
      return "fail_margin";
    case "price_drift":
      return "fail_quality";
    default:
      return "fail_quality";
  }
}

/** Set REPUBLISH_DEBUG=1 for per-candidate traces. Board totals always log once. */
const REPUBLISH_DEBUG = process.env.REPUBLISH_DEBUG === "1";

function debugLog(message: string, extra?: Record<string, unknown>) {
  if (!REPUBLISH_DEBUG) return;
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[republish-debug] ${message}${suffix}`);
}

function boardSummaryLog(extra: Record<string, unknown>) {
  console.log(`[republish-debug] Board built ${JSON.stringify(extra)}`);
}

type CandidateRow = {
  id: string;
  title: string | null;
  supplier: SupplierName;
  supplierProductId: string;
  supplierPrice: number | null;
  supplierCurrency: string | null;
  imageUrl: string | null;
  merchandiserRecId: string | null;
  status: string;
  importQueueItemId: string | null;
  pricing: unknown;
  snapshot: unknown;
  updatedAt: Date;
};

/** Prefer last publish job's candidate set («denne runden»). */
async function resolveRoundCandidateIds(): Promise<{
  ids: string[] | null;
  scoped: boolean;
}> {
  const row = await prisma.setting.findUnique({
    where: { key: "buyer_publish_job" },
  });
  const value = row?.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const ids = (value as { candidateIds?: unknown }).candidateIds;
    if (Array.isArray(ids) && ids.length > 0) {
      return {
        ids: ids.filter((x): x is string => typeof x === "string"),
        scoped: true,
      };
    }
  }
  return { ids: null, scoped: false };
}

async function loadPublishedKeys(
  candidates: CandidateRow[]
): Promise<Set<string>> {
  const published = new Set<string>();
  for (const c of candidates) {
    if (c.status === "imported") {
      published.add(c.id);
    }
  }

  const pairs = candidates
    .filter((c) => c.status !== "imported")
    .map((c) => ({
      supplier: String(c.supplier),
      supplierProductId: c.supplierProductId,
    }));
  if (pairs.length === 0) return published;

  // Active catalog products with same supplier SKU
  const productIds = [
    ...new Set(pairs.map((p) => p.supplierProductId).filter(Boolean)),
  ];
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: {
            isActive: true,
            supplierProductId: { in: productIds },
          },
          select: { supplierName: true, supplierProductId: true },
        })
      : [];
  const liveKeys = new Set(
    products.map(
      (p) => `${p.supplierName || ""}:${p.supplierProductId || ""}`
    )
  );

  const queueIds = candidates
    .map((c) => c.importQueueItemId)
    .filter((id): id is string => Boolean(id));
  const publishedQueue = queueIds.length
    ? await prisma.importQueueItem.findMany({
        where: {
          id: { in: queueIds },
          publishedAt: { not: null },
        },
        select: { id: true },
      })
    : [];
  const publishedQueueIds = new Set(publishedQueue.map((q) => q.id));

  for (const c of candidates) {
    const key = `${c.supplier}:${c.supplierProductId}`;
    if (liveKeys.has(key)) published.add(c.id);
    if (c.importQueueItemId && publishedQueueIds.has(c.importQueueItemId)) {
      published.add(c.id);
    }
  }
  return published;
}

function classifyOne(
  c: CandidateRow,
  publishedIds: Set<string>
): {
  status: RepublishRowStatus;
  gateReason: RepublishGateReason;
  gateProblems: string[];
  fields: ReturnType<typeof pricingFields>;
  tax: ReturnType<typeof classifyBuyerCandidate>;
} {
  const fields = pricingFields(c.pricing);
  const tax = classifyBuyerCandidate(c.title || "");

  if (publishedIds.has(c.id)) {
    return {
      status: "published",
      gateReason: "already_published",
      gateProblems: [],
      fields,
      tax,
    };
  }

  if (!(Number(c.supplierPrice) > 0)) {
    return {
      status: "fail_pricing",
      gateReason: "supplier_invalid",
      gateProblems: ["Manglende eller ugyldig leverandørpris"],
      fields,
      tax,
    };
  }

  if (!hasFullPricing(fields)) {
    return {
      status: "fail_pricing",
      gateReason: "pricing_missing",
      gateProblems: ["Manglende costNOK / landedCostNOK / retailNOK"],
      fields,
      tax,
    };
  }

  if (
    fields.flags.includes("freight_exceeds_product") ||
    (fields.costNOK != null &&
      fields.shippingNOK != null &&
      fields.shippingNOK > fields.costNOK)
  ) {
    return {
      status: "fail_freight",
      gateReason: "freight_gate",
      gateProblems: [
        `Frakt ${fields.shippingNOK} > produktkost ${fields.costNOK}`,
      ],
      fields,
      tax,
    };
  }

  // Estimated inbound freight understates live CJ freight — apply a
  // conservative board gate so READY ≈ live dry-run (not optimistic).
  const freightEstimated =
    (() => {
      const economic =
        c.pricing && typeof c.pricing === "object"
          ? (c.pricing as { economic?: { freight?: { estimated?: boolean } } })
              .economic
          : null;
      return economic?.freight?.estimated === true;
    })();
  if (
    freightEstimated &&
    fields.costNOK != null &&
    fields.costNOK > 0 &&
    fields.shippingNOK != null
  ) {
    // Typical live inbound is often ≥ 1.8× flat estimate for light SKUs.
    const conservativeShip = Math.max(
      fields.shippingNOK * 1.8,
      fields.shippingNOK + 20
    );
    if (conservativeShip > fields.costNOK) {
      return {
        status: "fail_freight",
        gateReason: "freight_gate",
        gateProblems: [
          `Estimert frakt (konservativ ${Math.round(conservativeShip)} NOK) > produktkost ${fields.costNOK}`,
        ],
        fields,
        tax,
      };
    }
  }

  if (
    fields.flags.includes("price_changed") ||
    fields.flags.includes("freight_changed")
  ) {
    return {
      status: "fail_quality",
      gateReason: "price_drift",
      gateProblems: fields.flags.filter((f) =>
        f === "price_changed" || f === "freight_changed"
      ),
      fields,
      tax,
    };
  }

  const snap =
    c.snapshot && typeof c.snapshot === "object"
      ? (c.snapshot as Record<string, unknown>)
      : {};
  const images = Array.isArray(snap.images)
    ? snap.images.map(String)
    : c.imageUrl
      ? [c.imageUrl]
      : [];

  const gate = evaluateAutoPublishGate({
    title: c.title || "",
    canImport: Boolean(c.merchandiserRecId),
    merchandiserRecId: c.merchandiserRecId,
    imageUrl: c.imageUrl,
    images,
    costNOK: fields.landedCostNOK ?? fields.costNOK,
    retailNOK: fields.retailNOK,
    marginPct: fields.marginPct,
    economicConfidence: fields.economicConfidence,
    requireEconomicPass: true,
    variantCount:
      typeof snap.variantCount === "number" ? snap.variantCount : null,
  });

  if (gate.ok) {
    debugLog("Quality Gate", {
      candidate: c.id,
      gate: "auto_publish",
      result: "pass",
      reason: null,
    });
    return {
      status: "ready",
      gateReason: "ready",
      gateProblems: [],
      fields,
      tax,
    };
  }

  const joined = gate.problems.join(" | ");
  let gateReason: RepublishGateReason = "other";
  if (/sikkerhet under|økonomisk validering/i.test(joined)) {
    gateReason = "econ_confidence";
  } else if (
    /Margin under sikker|Salgspris lavere enn landed/i.test(joined)
  ) {
    gateReason = "margin_gate";
  } else if (/Ekstrem margin/i.test(joined)) {
    gateReason = "extreme_margin";
  } else if (/bilder/i.test(joined)) {
    gateReason = "missing_media";
  } else if (/importkobling/i.test(joined)) {
    gateReason = "missing_import_link";
  } else if (
    /Passer ikke|Problemprodukt|Leketøy|kategorikonfidens/i.test(joined)
  ) {
    gateReason = "assortment";
  } else if (/variant/i.test(joined)) {
    gateReason = "variant";
  } else if (/innkjøp|salgspris/i.test(joined)) {
    gateReason = "pricing_missing";
  }

  debugLog("Quality Gate", {
    candidate: c.id,
    gate: "auto_publish",
    result: "fail",
    reason: gateReason,
    problems: gate.problems.slice(0, 3),
  });

  return {
    status: statusFromGateReason(gateReason),
    gateReason,
    gateProblems: gate.problems,
    fields,
    tax,
  };
}

/**
 * Fill missing NOK pricing from supplierPrice — no discovery / ranking / AI.
 * Prefers rows that lack costNOK/landedCostNOK so republish can unlock them.
 */
export async function fillMissingCandidatePricing(opts?: {
  limit?: number;
  /** Prefer these IDs (e.g. last publish round) */
  preferIds?: string[];
}): Promise<{ updated: number; scanned: number }> {
  const limit = Math.min(5_000, Math.max(1, opts?.limit || 2_000));
  const round = opts?.preferIds?.length
    ? { ids: opts.preferIds }
    : await resolveRoundCandidateIds();

  const rows = await prisma.buyerCandidate.findMany({
    where: round.ids
      ? { id: { in: round.ids }, supplierPrice: { gt: 0 } }
      : {
          status: { in: ["ranked", "imported"] },
          isBestInGroup: true,
          supplierPrice: { gt: 0 },
        },
    orderBy: { updatedAt: "asc" },
    take: Math.min(8_000, round.ids ? round.ids.length : limit * 4),
    select: {
      id: true,
      title: true,
      supplierPrice: true,
      supplierCurrency: true,
      pricing: true,
      overallScore: true,
      snapshot: true,
    },
  });

  let updated = 0;
  let scanned = 0;
  for (const row of rows) {
    if (updated >= limit) break;
    scanned += 1;
    const before = pricingFields(row.pricing);
    if (hasFullPricing(before)) {
      debugLog("Pricing fill skipped", {
        candidate: row.id,
        reason: "already_has_full_pricing",
        before: {
          costNOK: before.costNOK,
          landedCostNOK: before.landedCostNOK,
          retailNOK: before.retailNOK,
        },
      });
      continue;
    }

    const snap =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Record<string, unknown>)
        : {};
    const advice = estimateMerchandiserPricing({
      supplierPrice: Number(row.supplierPrice),
      currency: row.supplierCurrency || "USD",
      title: row.title,
      qualityScore: row.overallScore,
      variantCount:
        typeof snap.variantCount === "number" ? snap.variantCount : null,
    });

    const nextPricing = {
      ...(row.pricing && typeof row.pricing === "object"
        ? (row.pricing as object)
        : {}),
      ...advice,
    } as Prisma.InputJsonValue;

    await prisma.buyerCandidate.update({
      where: { id: row.id },
      data: { pricing: nextPricing },
    });
    updated += 1;
    const after = pricingFields(nextPricing);
    debugLog("Pricing fill updated", {
      candidate: row.id,
      before: {
        costNOK: before.costNOK,
        shippingNOK: before.shippingNOK,
        landedCostNOK: before.landedCostNOK,
        retailNOK: before.retailNOK,
      },
      after: {
        costNOK: after.costNOK,
        shippingNOK: after.shippingNOK,
        landedCostNOK: after.landedCostNOK,
        retailNOK: after.retailNOK,
        marginPct: after.marginPct,
        economicConfidence: after.economicConfidence,
      },
    });
  }

  debugLog("Pricing fill done", { scanned, updated, limit });
  console.log(
    `[republish-debug] Pricing fill done ${JSON.stringify({ scanned, updated, limit })}`
  );
  return { updated, scanned };
}

export async function getRepublishBoard(opts?: {
  status?: RepublishRowStatus | "all" | "fail_gate";
  gateReason?: RepublishGateReason | "all";
  limit?: number;
  offset?: number;
  q?: string;
  group?: string;
  category?: string;
  supplier?: string;
}): Promise<{
  summary: RepublishBoardSummary;
  rows: RepublishCandidateRow[];
  readyIds: string[];
  filteredTotal: number;
  filterOptions: {
    groups: string[];
    categories: string[];
    suppliers: string[];
  };
}> {
  const round = await resolveRoundCandidateIds();
  const candidates = (await prisma.buyerCandidate.findMany({
    where: round.ids
      ? { id: { in: round.ids } }
      : {
          status: { in: ["ranked", "imported"] },
          isBestInGroup: true,
        },
    orderBy: [{ shopMatchPct: "desc" }, { updatedAt: "desc" }],
    take: round.ids ? Math.min(20_000, round.ids.length) : 8_000,
    select: {
      id: true,
      title: true,
      supplier: true,
      supplierProductId: true,
      supplierPrice: true,
      supplierCurrency: true,
      imageUrl: true,
      merchandiserRecId: true,
      status: true,
      importQueueItemId: true,
      pricing: true,
      snapshot: true,
      updatedAt: true,
    },
  })) as CandidateRow[];

  // Preserve publish-job order when scoped
  let ordered = candidates;
  if (round.ids) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    ordered = round.ids
      .map((id) => byId.get(id))
      .filter((c): c is CandidateRow => Boolean(c));
  }

  const publishedIds = await loadPublishedKeys(ordered);

  const summary: RepublishBoardSummary = {
    ready: 0,
    failGate: 0,
    published: 0,
    total: ordered.length,
    failPricing: 0,
    failMargin: 0,
    failFreight: 0,
    failQuality: 0,
    pricingOk: 0,
    scopedToPublishJob: round.scoped,
    gateReasons: emptyGateReasons(),
  };

  const classified: RepublishCandidateRow[] = [];
  const readyIds: string[] = [];
  const groups = new Set<string>();
  const categories = new Set<string>();
  const suppliers = new Set<string>();

  for (const c of ordered) {
    const { status, gateReason, gateProblems, fields, tax } = classifyOne(
      c,
      publishedIds
    );
    if (hasFullPricing(fields)) summary.pricingOk += 1;
    summary.gateReasons[gateReason] += 1;

    if (status === "ready") {
      summary.ready += 1;
      readyIds.push(c.id);
    } else if (status === "published") {
      summary.published += 1;
    } else {
      summary.failGate += 1;
      if (status === "fail_pricing") summary.failPricing += 1;
      else if (status === "fail_margin") summary.failMargin += 1;
      else if (status === "fail_freight") summary.failFreight += 1;
      else summary.failQuality += 1;
    }

    groups.add(tax.shelfLabel);
    categories.add(tax.main);
    suppliers.add(String(c.supplier));

    classified.push({
      id: c.id,
      title: c.title || "Uten tittel",
      imageUrl: c.imageUrl,
      supplier: String(c.supplier),
      supplierProductId: c.supplierProductId,
      category: tax.main,
      group: tax.shelfLabel,
      landedCostNOK: fields.landedCostNOK,
      retailNOK: fields.retailNOK,
      marginPct: fields.marginPct,
      status,
      statusLabel: statusLabel(status),
      gateReason,
      gateReasonLabel: gateReasonLabel(gateReason),
      gateProblems,
      updatedAt: c.updatedAt.toISOString(),
    });
  }

  boardSummaryLog({
    TOTAL: summary.total,
    READY: summary.ready,
    FAILED: summary.failGate,
    PUBLISHED: summary.published,
    gateReasons: summary.gateReasons,
    scoped: summary.scopedToPublishJob,
  });

  const sumParts = summary.ready + summary.failGate + summary.published;
  if (sumParts !== summary.total) {
    const msg = `Republish board invariant broken: READY(${summary.ready})+FAILED(${summary.failGate})+PUBLISHED(${summary.published})=${sumParts} !== TOTAL(${summary.total})`;
    console.error(`[republish-debug] ${msg}`);
    throw new Error(msg);
  }

  const tab = opts?.status || "all";
  let filtered = classified;
  if (tab === "fail_gate") {
    filtered = classified.filter(
      (r) =>
        r.status === "fail_margin" ||
        r.status === "fail_freight" ||
        r.status === "fail_pricing" ||
        r.status === "fail_quality"
    );
  } else if (tab === "ready") {
    filtered = classified.filter((r) => r.status === "ready");
  } else if (tab === "published") {
    filtered = classified.filter((r) => r.status === "published");
  } else if (tab !== "all") {
    filtered = classified.filter((r) => r.status === tab);
  }

  if (opts?.gateReason && opts.gateReason !== "all") {
    filtered = filtered.filter((r) => r.gateReason === opts.gateReason);
  }

  const q = (opts?.q || "").trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.supplierProductId.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }
  if (opts?.group && opts.group !== "all") {
    filtered = filtered.filter((r) => r.group === opts.group);
  }
  if (opts?.category && opts.category !== "all") {
    filtered = filtered.filter((r) => r.category === opts.category);
  }
  if (opts?.supplier && opts.supplier !== "all") {
    filtered = filtered.filter((r) => r.supplier === opts.supplier);
  }

  const offset = Math.max(0, opts?.offset || 0);
  const limit = Math.min(100, Math.max(1, opts?.limit || 25));
  const rows = filtered.slice(offset, offset + limit);

  return {
    summary,
    rows,
    readyIds,
    filteredTotal: filtered.length,
    filterOptions: {
      groups: [...groups].sort(),
      categories: [...categories].sort(),
      suppliers: [...suppliers].sort(),
    },
  };
}

/**
 * Start republish job — only ready IDs (full pricing + Quality Gate pass).
 * Uses same worker pipeline as buyer_publish_job.
 */
export async function startBuyerRepublishJob(input: {
  ids?: string[];
  batchSize?: number;
  actorEmail?: string | null;
  /** Fill missing pricing from supplierPrice before selecting ready set */
  fillMissingPricing?: boolean;
}): Promise<{
  job: BuyerPublishJobSnapshot;
  summary: RepublishBoardSummary;
  selected: number;
}> {
  if (input.fillMissingPricing !== false) {
    await fillMissingCandidatePricing({ limit: 3_000 });
  }

  const board = await getRepublishBoard({ limit: 1 });
  let ids = (input.ids || []).filter(Boolean);
  if (!ids.length) {
    ids = board.readyIds;
  } else {
    const readySet = new Set(board.readyIds);
    ids = ids.filter((id) => readySet.has(id));
  }

  if (!ids.length) {
    throw new Error(
      "Ingen kandidater klare for republisering (mangler pricing eller feiler Quality Gate)"
    );
  }

  const existing = await getBuyerPublishJob("republish");
  if (existing?.status === "running") {
    return {
      job: existing,
      summary: board.summary,
      selected: existing.total,
    };
  }

  const pubRunning = await getBuyerPublishJob("publish");
  if (pubRunning?.status === "running") {
    throw new Error(
      "Vanlig publisering kjører allerede — vent til den er ferdig før republisering"
    );
  }

  const titles = board.rows
    .filter((r) => ids.includes(r.id))
    .reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.title;
      return acc;
    }, {});
  // readyIds may not all be in the limited rows page — load titles
  const missingTitleIds = ids.filter((id) => !titles[id]);
  if (missingTitleIds.length) {
    const titleRows = await prisma.buyerCandidate.findMany({
      where: { id: { in: missingTitleIds } },
      select: { id: true, title: true },
    });
    for (const t of titleRows) {
      titles[t.id] = t.title || "";
    }
  }

  const job = await startBuyerPublishJobFromIds({
    kind: "republish",
    ids,
    titles: ids.map((id) => titles[id] || ""),
    batchSize: input.batchSize,
    thumbUp: false,
    actorEmail: input.actorEmail,
    selectionFilter: {
      group: "republish",
      excludeCount: 0,
    },
  });

  return {
    job,
    summary: board.summary,
    selected: ids.length,
  };
}

export async function getBuyerRepublishJob(): Promise<BuyerPublishJobSnapshot | null> {
  return getBuyerPublishJob("republish");
}
