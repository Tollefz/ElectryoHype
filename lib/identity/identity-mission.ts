/**
 * Mission Control snapshot for Store Identity Fit.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getStoreIdentityContext } from "./store-identity-context";
import { scoreStoreIdentityFit } from "./store-identity-fit";
import type { StoreIdentityMissionSnapshot } from "./types";

/**
 * Build Mission Control «Store Identity» section from recent candidates + context.
 */
export async function getStoreIdentityMissionSnapshot(): Promise<StoreIdentityMissionSnapshot> {
  const ctx = await getStoreIdentityContext();

  const recent = await prisma.buyerCandidate.findMany({
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      shopMatchPct: true,
      scores: true,
      status: true,
      snapshot: true,
    },
  });

  const lowFitCandidates: StoreIdentityMissionSnapshot["lowFitCandidates"] = [];
  const strengthensProfile: StoreIdentityMissionSnapshot["strengthensProfile"] =
    [];
  const reasonCounts = new Map<string, number>();
  const rejectCatCounts = new Map<string, number>();
  let fitSum = 0;
  let fitN = 0;
  let rejectBandCount = 0;
  let weakBandCount = 0;

  for (const c of recent) {
    const scores =
      c.scores && typeof c.scores === "object" && !Array.isArray(c.scores)
        ? (c.scores as Record<string, unknown>)
        : {};
    const cached = scores.identityFit as
      | { score?: number; why?: string; familyId?: string | null; band?: string }
      | undefined;

    let score = cached?.score;
    let why = cached?.why;
    let familyId = cached?.familyId ?? null;
    let band = cached?.band;

    const snap =
      c.snapshot && typeof c.snapshot === "object" && !Array.isArray(c.snapshot)
        ? (c.snapshot as Record<string, unknown>)
        : {};
    const categoryHint =
      typeof snap.categoryHint === "string"
        ? snap.categoryHint
        : typeof snap.category === "string"
          ? snap.category
          : null;
    const supplierCategory =
      typeof snap.category === "string" ? snap.category : null;
    const title = c.title || "Uten tittel";

    if (score == null || why == null) {
      const fit = scoreStoreIdentityFit(
        {
          title,
          categoryHint,
          supplierCategory,
          shopMatchPct: c.shopMatchPct,
        },
        ctx
      );
      score = fit.score;
      why = fit.why;
      familyId = fit.familyId;
      band = fit.band;
      for (const r of fit.reasons) {
        reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
      }
    } else if (why) {
      reasonCounts.set(why, (reasonCounts.get(why) || 0) + 1);
    }

    fitSum += score;
    fitN += 1;
    if (band === "reject" || score < 25) rejectBandCount += 1;
    else if (band === "weak" || score < 45) weakBandCount += 1;

    if (score < 45) {
      lowFitCandidates.push({
        id: c.id,
        title,
        score,
        why: why || "Lav identitetsfit",
        familyId,
      });
      const cat = categoryHint || familyId || "ukjent";
      rejectCatCounts.set(cat, (rejectCatCounts.get(cat) || 0) + 1);
    } else if (score >= 85) {
      strengthensProfile.push({
        title,
        score,
        why: why || "Styrker profil",
        familyId,
      });
    }
  }

  lowFitCandidates.sort((a, b) => a.score - b.score);
  strengthensProfile.sort((a, b) => b.score - a.score);

  const commonReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  const rejectedCategoryHints = [...rejectCatCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return {
    rebuiltAt: ctx.rebuiltAt,
    contextStoreName: ctx.storeName,
    catalogProductCount: ctx.catalogProductCount,
    lowFitCandidates: lowFitCandidates.slice(0, 12),
    commonReasons,
    rejectedCategoryHints,
    strengthensProfile: strengthensProfile.slice(0, 10),
    avgFitRecent: fitN > 0 ? Math.round(fitSum / fitN) : null,
    rejectBandCount,
    weakBandCount,
  };
}
