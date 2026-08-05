/**
 * Admin JA → klargjør + publiser (via existing import pipeline).
 * Dry-run evaluates gate without import/publish.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { importBuyerCandidatesByIds } from "@/lib/buyer/bulk";
import { recordBuyerThumb } from "@/lib/buyer/admin-preferences";
import {
  evaluateAutoPublishGate,
  type AutoPublishGateResult,
} from "@/lib/buyer/auto-publish-gate";
import {
  parseEconomicFromPricing,
  revalidateEconomicsForPublish,
} from "@/lib/buyer/economic-validation";
import { recordSupplierPriceSighting } from "@/lib/buyer/supplier-risk";
import {
  processImportQueueItem,
  publishImportQueueItem,
  approveImportQueueItem,
} from "@/lib/suppliers/import-queue";
import { getCatalogProvider } from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import { ImportQueueStatus } from "@prisma/client";
import { toBuyerCard } from "@/lib/ops/desk-buyer-groups";
import { getPreferenceContext } from "@/lib/buyer/admin-preferences";

export type ApprovePublishItemResult = {
  candidateId: string;
  title: string;
  status: "published" | "needs_control" | "failed" | "would_publish" | "would_need_control";
  problems: string[];
  reasonsOk: string[];
  productId?: string | null;
  queueItemId?: string | null;
  message: string;
};

export type ApprovePublishResult = {
  ok: true;
  dryRun: boolean;
  published: number;
  needsControl: number;
  failed: number;
  outcomes: ApprovePublishItemResult[];
  summary: string;
};

function pricingFromCandidate(row: {
  supplierPrice: number | null;
  supplierCurrency?: string | null;
  pricing: unknown;
}): {
  costNOK: number | null;
  retailNOK: number | null;
  marginPct: number | null;
  shippingNOK: number | null;
  landedCostNOK: number | null;
  economicConfidence: number | null;
} {
  const pricing =
    row.pricing && typeof row.pricing === "object"
      ? (row.pricing as Record<string, unknown>)
      : {};
  const economic = parseEconomicFromPricing(row.pricing);
  const cost =
    economic?.costNOK ??
    (pricing.costNOK != null
      ? Number(pricing.costNOK)
      : pricing.landedCostNOK != null
        ? Number(pricing.landedCostNOK)
        : null);
  const retail =
    economic?.retailNOK ??
    (pricing.retailNOK != null
      ? Number(pricing.retailNOK)
      : pricing.estimatedRetailNOK != null
        ? Number(pricing.estimatedRetailNOK)
        : pricing.suggestedRetailNOK != null
          ? Number(pricing.suggestedRetailNOK)
          : null);
  const margin =
    economic?.marginPct ??
    (pricing.marginPct != null
      ? Number(pricing.marginPct)
      : pricing.estimatedMarginPct != null
        ? Number(pricing.estimatedMarginPct)
        : cost != null && retail != null && retail > 0
          ? ((retail - cost) / retail) * 100
          : null);
  return {
    costNOK: cost != null && Number.isFinite(cost) ? cost : null,
    retailNOK: retail != null && Number.isFinite(retail) ? retail : null,
    marginPct: margin != null && Number.isFinite(margin) ? margin : null,
    shippingNOK:
      economic?.shippingNOK ??
      (pricing.shippingNOK != null ? Number(pricing.shippingNOK) : null),
    landedCostNOK:
      economic?.landedCostNOK ??
      (pricing.landedCostNOK != null ? Number(pricing.landedCostNOK) : null),
    economicConfidence:
      economic?.confidence ??
      (pricing.economicConfidence != null
        ? Number(pricing.economicConfidence)
        : null),
  };
}

async function liveEconomicRevalidate(row: {
  supplier: string;
  supplierProductId: string;
  supplierPrice: number | null;
  supplierCurrency: string | null;
  pricing: unknown;
  snapshot: unknown;
}): Promise<{
  ok: boolean;
  message: string;
  problems: string[];
  reasonsOk: string[];
  economicConfidence?: number;
  /** Live-recomputed economics — prefer over stored pricing in Quality Gate */
  landedCostNOK?: number | null;
  retailNOK?: number | null;
  marginPct?: number | null;
}> {
  const prices = pricingFromCandidate(row);
  const economic = parseEconomicFromPricing(row.pricing);
  const snap =
    row.snapshot && typeof row.snapshot === "object"
      ? (row.snapshot as Record<string, unknown>)
      : {};

  // Estimated inbound freight must NOT be a drift baseline — otherwise every
  // merchandiser-filled candidate fails live revalidate with «Frakt endret».
  const shippingWasEstimated =
    economic?.freight?.estimated === true ||
    String(economic?.freight?.method || "").includes("estimert");
  const storedShippingForDrift = shippingWasEstimated
    ? null
    : prices.shippingNOK ?? economic?.shippingNOK ?? null;

  let livePrice: number | null = null;
  let liveCurrency: string | null = row.supplierCurrency;
  let liveShipping: number | null = null;
  let liveWeight: number | null = null;
  let liveVariants: number[] | null = null;
  let available = true;

  try {
    const provider = getCatalogProvider(row.supplier as CatalogSupplierId);
    if (!(await provider.isConfigured())) {
      available = false;
    } else {
      const detail = await provider.getProduct(row.supplierProductId);
      if (!detail) {
        available = false;
      } else {
        livePrice = detail.price;
        liveCurrency = detail.currency || liveCurrency;
        liveShipping = detail.shippingEstimate ?? null;
        liveWeight = detail.weightGrams ?? null;
        liveVariants = (detail.variants || [])
          .map((v) => Number(v.price))
          .filter((p) => Number.isFinite(p) && p > 0);
      }
    }
  } catch {
    available = false;
  }

  const result = await revalidateEconomicsForPublish({
    storedSupplierPrice: Number(row.supplierPrice) || 0,
    storedCurrency: row.supplierCurrency || "USD",
    storedShippingNOK: storedShippingForDrift,
    storedRetailNOK: prices.retailNOK,
    liveSupplierPrice: livePrice,
    liveCurrency,
    liveShipping,
    liveWeightGrams: liveWeight,
    liveVariantPrices: liveVariants,
    variantCount:
      typeof snap.variantCount === "number"
        ? snap.variantCount
        : liveVariants?.length ?? null,
    supplierAvailable: available,
  });

  if (livePrice != null && available) {
    await recordSupplierPriceSighting({
      supplier: row.supplier,
      productId: row.supplierProductId,
      price: livePrice,
    }).catch(() => undefined);
  }

  return {
    ok: result.ok,
    message: result.message,
    problems: result.problems,
    reasonsOk: result.reasonsOk,
    economicConfidence: result.economic.confidence,
    landedCostNOK: result.economic.landedCostNOK,
    retailNOK: result.economic.retailNOK,
    marginPct: result.economic.marginPct,
  };
}

function gateMessage(gate: AutoPublishGateResult, published: boolean): string {
  if (published) return "✓ Produktet er publisert";
  if (gate.problems.length) {
    return `Trenger kontroll: ${gate.problems[0]}`;
  }
  return "Trenger kontroll";
}

/**
 * Explicit admin approval → prepare + publish through existing pipeline.
 */
export async function approveAndPublishCandidates(input: {
  ids: string[];
  dryRun?: boolean;
  /** Record 👍 for each id before processing */
  thumbUp?: boolean;
  actorEmail?: string | null;
  storeId?: string | null;
  /** Max items to fully process (safety) */
  limit?: number;
}): Promise<ApprovePublishResult> {
  const dryRun = Boolean(input.dryRun);
  const ids = Array.from(new Set((input.ids || []).filter(Boolean))).slice(
    0,
    Math.min(200, input.limit || 50)
  );
  const outcomes: ApprovePublishItemResult[] = [];

  if (ids.length === 0) {
    return {
      ok: true,
      dryRun,
      published: 0,
      needsControl: 0,
      failed: 0,
      outcomes: [],
      summary: "Ingen produkter valgt",
    };
  }

  if (input.thumbUp && !dryRun) {
    for (const id of ids) {
      try {
        await recordBuyerThumb({
          candidateId: id,
          vote: "up",
          actorEmail: input.actorEmail,
          storeId: input.storeId,
        });
      } catch {
        /* candidate may already be non-ranked — preference still best-effort */
      }
    }
  }

  const prefs = await getPreferenceContext(input.storeId);
  const candidates = await prisma.buyerCandidate.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      outcomes.push({
        candidateId: id,
        title: "Ukjent",
        status: dryRun ? "would_need_control" : "failed",
        problems: ["Kandidat finnes ikke"],
        reasonsOk: [],
        message: "Trenger kontroll: Kandidat finnes ikke",
      });
      continue;
    }

    const title = row.title || "Uten tittel";
    const prices = pricingFromCandidate(row);
    let cardCanImport = Boolean(row.merchandiserRecId);
    try {
      const card = toBuyerCard(
        {
          id: row.id,
          title: row.title,
          imageUrl: row.imageUrl,
          supplier: row.supplier,
          supplierPrice: row.supplierPrice,
          overallScore: row.overallScore,
          shopMatchPct: row.shopMatchPct,
          shopMatchWhy: row.shopMatchWhy,
          discoveryTags: row.discoveryTags,
          risks: row.risks,
          reasons: row.reasons,
          pricing: row.pricing,
          scores: row.scores,
          snapshot: row.snapshot,
          merchandiserRecId: row.merchandiserRecId,
          rank: row.rank,
          createdAt: row.createdAt,
        },
        { prefs }
      );
      cardCanImport = card.canImport;
    } catch {
      /* use merchandiserRecId */
    }

    const snap =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Record<string, unknown>)
        : {};
    const images =
      Array.isArray(snap.images)
        ? snap.images.map(String)
        : row.imageUrl
          ? [row.imageUrl]
          : [];

    const scoresObj =
      row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)
        ? (row.scores as Record<string, unknown>)
        : {};
    let identityCached =
      scoresObj.identityFit &&
      typeof scoresObj.identityFit === "object" &&
      !Array.isArray(scoresObj.identityFit)
        ? (scoresObj.identityFit as {
            score?: number;
            why?: string;
            normallyBlockPublish?: boolean;
          })
        : null;

    if (identityCached?.score == null) {
      try {
        const { getStoreIdentityContext, scoreStoreIdentityFit } = await import(
          "@/lib/identity"
        );
        const ctx = await getStoreIdentityContext(input.storeId);
        const fit = scoreStoreIdentityFit(
          {
            title,
            categoryHint:
              typeof snap.categoryHint === "string"
                ? snap.categoryHint
                : typeof snap.category === "string"
                  ? snap.category
                  : null,
            shopMatchPct: row.shopMatchPct,
          },
          ctx
        );
        identityCached = {
          score: fit.score,
          why: fit.why,
          normallyBlockPublish: fit.normallyBlockPublish,
        };
      } catch {
        /* leave null — gate skips identity when missing */
      }
    }

    // Economic Validation — last check before publish
    const econGate = await liveEconomicRevalidate({
      supplier: row.supplier,
      supplierProductId: row.supplierProductId,
      supplierPrice: row.supplierPrice,
      supplierCurrency: row.supplierCurrency,
      pricing: row.pricing,
      snapshot: row.snapshot,
    });

    if (!econGate.ok) {
      outcomes.push({
        candidateId: id,
        title,
        status: dryRun ? "would_need_control" : "needs_control",
        problems: econGate.problems,
        reasonsOk: econGate.reasonsOk,
        message: econGate.message,
      });
      continue;
    }

    const preGate = evaluateAutoPublishGate({
      title,
      canImport: cardCanImport,
      merchandiserRecId: row.merchandiserRecId,
      imageUrl: row.imageUrl,
      images,
      // Prefer live economics when revalidate ran — never feed stale NOK into the gate.
      costNOK:
        econGate.landedCostNOK ??
        prices.landedCostNOK ??
        prices.costNOK,
      retailNOK: econGate.retailNOK ?? prices.retailNOK,
      marginPct: econGate.marginPct ?? prices.marginPct,
      economicConfidence:
        econGate.economicConfidence ?? prices.economicConfidence,
      requireEconomicPass: true,
      variantCount:
        typeof snap.variantCount === "number"
          ? snap.variantCount
          : Array.isArray(snap.variants)
            ? snap.variants.length
            : null,
      identityFitScore:
        typeof identityCached?.score === "number"
          ? identityCached.score
          : null,
      identityFitWhy: identityCached?.why || null,
    });

    if (dryRun) {
      outcomes.push({
        candidateId: id,
        title,
        status: preGate.ok ? "would_publish" : "would_need_control",
        problems: preGate.problems,
        reasonsOk: [...econGate.reasonsOk, ...preGate.reasonsOk],
        message: preGate.ok
          ? "✔ Økonomisk kontroll bestått — ville blitt publisert (dry-run)"
          : gateMessage(preGate, false),
      });
      continue;
    }

    if (!preGate.ok) {
      outcomes.push({
        candidateId: id,
        title,
        status: "needs_control",
        problems: preGate.problems,
        reasonsOk: [...econGate.reasonsOk, ...preGate.reasonsOk],
        message: gateMessage(preGate, false),
      });
      continue;
    }

    // Import → process → publish via existing pipeline
    try {
      let queueItemId = row.importQueueItemId;

      if (!queueItemId || row.status === "ranked") {
        const imported = await importBuyerCandidatesByIds({
          ids: [id],
          storeId: input.storeId,
          actorEmail: input.actorEmail,
        });
        queueItemId = imported.queueItemIds[0] || null;
        if (!queueItemId) {
          outcomes.push({
            candidateId: id,
            title,
            status: "needs_control",
            problems: [
              "Kunne ikke legge i importkø (mangler leverandørkobling?)",
            ],
            reasonsOk: preGate.reasonsOk,
            message:
              "Trenger kontroll: Kunne ikke legge i importkø",
          });
          continue;
        }
      }

      const processed = await processImportQueueItem(queueItemId);
      const item = await prisma.importQueueItem.findUnique({
        where: { id: queueItemId },
      });
      const completeness = item?.completeness as
        | { score?: number; requiresReview?: boolean }
        | null;

      const productId = item?.productId || processed.productId || null;

      // Idempotent: catalog product already live — do not create another.
      if (
        (processed as { alreadyPublished?: boolean }).alreadyPublished ||
        item?.status === ImportQueueStatus.published
      ) {
        await prisma.buyerCandidate
          .update({
            where: { id },
            data: {
              status: "imported",
              importQueueItemId: queueItemId,
            },
          })
          .catch(() => undefined);
        outcomes.push({
          candidateId: id,
          title,
          status: "needs_control",
          problems: [
            "Already published",
            "existing catalog product",
          ],
          reasonsOk: preGate.reasonsOk,
          productId,
          queueItemId,
          message:
            "Already published — existing catalog product",
        });
        continue;
      }

      const salePrice =
        item?.pricing &&
        typeof item.pricing === "object" &&
        (item.pricing as { recommendedSalePrice?: number }).recommendedSalePrice !=
          null
          ? Number(
              (item.pricing as { recommendedSalePrice: number })
                .recommendedSalePrice
            )
          : prices.retailNOK;

      const postGate = evaluateAutoPublishGate({
        title: item?.title || title,
        canImport: true,
        merchandiserRecId: row.merchandiserRecId || "ok",
        imageUrl: row.imageUrl,
        images,
        costNOK:
          econGate.landedCostNOK ??
          prices.landedCostNOK ??
          prices.costNOK,
        retailNOK: salePrice ?? econGate.retailNOK ?? prices.retailNOK,
        marginPct: econGate.marginPct ?? prices.marginPct,
        economicConfidence: econGate.economicConfidence,
        queueStatus: item?.status || null,
        reviewReason: item?.reviewReason || item?.error || null,
        completenessScore: completeness?.score ?? null,
        completenessRequiresReview: completeness?.requiresReview ?? null,
        productId,
        adminApproved: true,
        identityFitScore:
          typeof identityCached?.score === "number"
            ? identityCached.score
            : null,
        identityFitWhy: identityCached?.why || null,
      });

      const canAutoPublish =
        Boolean(productId) &&
        postGate.ok &&
        item?.status !== ImportQueueStatus.failed;

      if (canAutoPublish && productId && queueItemId) {
        if (
          item?.status === ImportQueueStatus.review ||
          item?.status === ImportQueueStatus.approved
        ) {
          if (item.status === ImportQueueStatus.review) {
            await approveImportQueueItem(queueItemId);
          }
          const pub = await publishImportQueueItem(queueItemId);
          await prisma.buyerCandidate
            .update({
              where: { id },
              data: {
                status: "imported",
                importQueueItemId: queueItemId,
              },
            })
            .catch(() => undefined);

          outcomes.push({
            candidateId: id,
            title,
            status: "published",
            problems: [],
            reasonsOk: postGate.reasonsOk,
            productId: pub.productId,
            queueItemId,
            message: "✔ Økonomisk kontroll bestått — produktet er publisert",
          });
          continue;
        }
      }

      const problems =
        postGate.problems.length > 0
          ? postGate.problems
          : [
              item?.reviewReason ||
                item?.error ||
                "Import fullført men trenger manuell kontroll før publisering",
            ];

      outcomes.push({
        candidateId: id,
        title,
        status: "needs_control",
        problems,
        reasonsOk: postGate.reasonsOk,
        productId: item?.productId || null,
        queueItemId,
        message: `Trenger kontroll: ${problems[0]}`,
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Ukjent feil under klargjøring";
      outcomes.push({
        candidateId: id,
        title,
        status: "failed",
        problems: [msg],
        reasonsOk: preGate.reasonsOk,
        message: `Trenger kontroll: ${msg}`,
      });
    }
  }

  const published = outcomes.filter((o) => o.status === "published").length;
  const wouldPublish = outcomes.filter((o) => o.status === "would_publish").length;
  const needsControl = outcomes.filter(
    (o) =>
      o.status === "needs_control" ||
      o.status === "would_need_control" ||
      o.status === "failed"
  ).length;
  const failed = outcomes.filter((o) => o.status === "failed").length;

  const summary = dryRun
    ? `Dry-run: ${wouldPublish} ville publiseres · ${needsControl} trenger kontroll`
    : published > 0 && needsControl === 0
      ? published === 1
        ? "✓ Produktet er publisert"
        : `✓ ${published} produkter er publisert`
      : `${published} publisert · ${needsControl} trenger kontroll`;

  return {
    ok: true,
    dryRun,
    published: dryRun ? wouldPublish : published,
    needsControl,
    failed,
    outcomes,
    summary,
  };
}
