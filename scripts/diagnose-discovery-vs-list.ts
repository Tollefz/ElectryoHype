/**
 * Discovery vs candidate-list diagnosis — read-only, no algorithm changes.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily, familyLabel } from "../lib/intelligence/families";
import { primaryGroupForFamily } from "../lib/buyer/product-focus-core";

const prisma = new PrismaClient();

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  // Prefer discovery-enabled scan with most candidates
  const runs = await prisma.buyerScanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      scanned: true,
      kept: true,
      filtered: true,
      startedAt: true,
      checkpoint: true,
      request: true,
    },
  });

  const withDisc = runs.filter((r) => {
    const cp =
      r.checkpoint && typeof r.checkpoint === "object"
        ? (r.checkpoint as Record<string, unknown>)
        : null;
    return Boolean(cp?.discovery);
  });

  const run =
    withDisc.sort((a, b) => b.kept - a.kept)[0] ||
    runs.sort((a, b) => b.kept - a.kept)[0];

  if (!run) {
    console.error(JSON.stringify({ error: "NO_RUN" }));
    process.exit(2);
  }

  const cp =
    run.checkpoint && typeof run.checkpoint === "object"
      ? (run.checkpoint as Record<string, unknown>)
      : {};
  const discovery =
    cp.discovery && typeof cp.discovery === "object"
      ? (cp.discovery as Record<string, unknown>)
      : {};
  const familyScanCounts =
    discovery.familyScanCounts && typeof discovery.familyScanCounts === "object"
      ? (discovery.familyScanCounts as Record<string, number>)
      : {};
  const groupScanCounts =
    discovery.groupScanCounts && typeof discovery.groupScanCounts === "object"
      ? (discovery.groupScanCounts as Record<string, number>)
      : {};

  const req =
    run.request && typeof run.request === "object"
      ? (run.request as Record<string, unknown>)
      : {};
  const progress =
    req.progress && typeof req.progress === "object"
      ? (req.progress as Record<string, unknown>)
      : {};
  const discoveryPlan =
    progress.discoveryPlan && typeof progress.discoveryPlan === "object"
      ? (progress.discoveryPlan as Record<string, unknown>)
      : null;
  const discVal =
    req.discoveryValidation && typeof req.discoveryValidation === "object"
      ? (req.discoveryValidation as Record<string, unknown>)
      : null;
  const decisions = Array.isArray(discVal?.decisions)
    ? (discVal!.decisions as Array<Record<string, unknown>>)
    : [];

  const rows = await prisma.buyerCandidate.findMany({
    where: {
      scanRunId: run.id,
      status: { in: ["ranked", "imported", "queued"] },
      isBestInGroup: true,
    },
    orderBy: [{ rank: "asc" }, { shopMatchPct: "desc" }, { overallScore: "desc" }],
    select: {
      id: true,
      title: true,
      rank: true,
      shopMatchPct: true,
      overallScore: true,
      status: true,
      scores: true,
      pricing: true,
      snapshot: true,
      createdAt: true,
    },
  });

  // Family distribution of stored candidates
  type FamAgg = {
    id: string;
    label: string;
    group: string;
    count: number;
    top100: number;
    after100: number;
    unranked: number;
    avgMatch: number;
    avgOverall: number;
    avgMerch: number | null;
    avgMargin: number | null;
    avgAssortment: number | null;
    avgFocus: number | null;
    sampleTitles: string[];
  };

  const byFam = new Map<string, FamAgg & { _m: number[]; _o: number[]; _merch: number[]; _margin: number[]; _ass: number[]; _foc: number[] }>();

  for (const r of rows) {
    const fam = matchFamily(r.title || "") || "other";
    const g = primaryGroupForFamily(fam)?.id || "other";
    let agg = byFam.get(fam);
    if (!agg) {
      agg = {
        id: fam,
        label: familyLabel(fam) || fam,
        group: g,
        count: 0,
        top100: 0,
        after100: 0,
        unranked: 0,
        avgMatch: 0,
        avgOverall: 0,
        avgMerch: null,
        avgMargin: null,
        avgAssortment: null,
        avgFocus: null,
        sampleTitles: [],
        _m: [],
        _o: [],
        _merch: [],
        _margin: [],
        _ass: [],
        _foc: [],
      };
      byFam.set(fam, agg);
    }
    agg.count += 1;
    const rank = r.rank;
    if (rank == null) agg.unranked += 1;
    else if (rank <= 100) agg.top100 += 1;
    else agg.after100 += 1;

    agg._m.push(r.shopMatchPct);
    agg._o.push(r.overallScore);
    const scores =
      r.scores && typeof r.scores === "object"
        ? (r.scores as Record<string, unknown>)
        : {};
    const merch = num(scores.butikkscore) ?? num(scores.merchScore);
    if (merch != null) agg._merch.push(merch);
    const assortment =
      scores.assortment && typeof scores.assortment === "object"
        ? (scores.assortment as Record<string, unknown>)
        : null;
    const assTotal = num(assortment?.total);
    if (assTotal != null) agg._ass.push(assTotal);
    const focus =
      scores.productFocus && typeof scores.productFocus === "object"
        ? (scores.productFocus as Record<string, unknown>)
        : null;
    const foc = num(focus?.score);
    if (foc != null) agg._foc.push(foc);
    const pricing =
      r.pricing && typeof r.pricing === "object"
        ? (r.pricing as Record<string, unknown>)
        : {};
    const margin =
      num(pricing.marginPct) ??
      num(pricing.estimatedMarginPct) ??
      num(pricing.grossMarginPct);
    if (margin != null) agg._margin.push(margin);
    if (agg.sampleTitles.length < 3) agg.sampleTitles.push(r.title || "");
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  const familyTable = [...byFam.values()]
    .map((a) => ({
      id: a.id,
      label: a.label,
      group: a.group,
      count: a.count,
      top100: a.top100,
      after100: a.after100,
      unranked: a.unranked,
      avgMatch: avg(a._m),
      avgOverall: avg(a._o),
      avgMerch: avg(a._merch),
      avgMargin: avg(a._margin),
      avgAssortment: avg(a._ass),
      avgFocus: avg(a._foc),
      discoveryAttributed: familyScanCounts[a.id] || 0,
      sampleTitles: a.sampleTitles,
    }))
    .sort((a, b) => b.count - a.count);

  // Top 100 breakdown
  const ranked = rows.filter((r) => r.rank != null).sort((a, b) => (a.rank! - b.rank!));
  const top100 = ranked.slice(0, 100);
  const top100ByFam: Record<string, number> = {};
  for (const r of top100) {
    const fam = matchFamily(r.title || "") || "other";
    top100ByFam[fam] = (top100ByFam[fam] || 0) + 1;
  }

  // Score component comparison: gaming mouse/keyboard cluster vs target families
  const TARGET_FAMS = [
    "powerbank",
    "magsafe",
    "ssd",
    "usb_c_hub",
    "usb_c_cable",
    "charger",
    "qi_charger",
    "docking_station",
    "ram",
  ];
  const GAMING_FAMS = [
    "gaming_mouse",
    "mouse",
    "wireless_mouse",
    "gaming_keyboard",
    "keyboard",
    "mechanical_keyboard",
    "mouse_pad",
  ];

  function clusterStats(ids: string[]) {
    const set = new Set(ids);
    const subset = familyTable.filter((f) => set.has(f.id));
    const count = subset.reduce((s, f) => s + f.count, 0);
    const top = subset.reduce((s, f) => s + f.top100, 0);
    const after = subset.reduce((s, f) => s + f.after100, 0);
    const disc = subset.reduce((s, f) => s + f.discoveryAttributed, 0);
    return {
      families: subset.map((f) => f.id),
      count,
      top100: top,
      after100: after,
      discoveryAttributed: disc,
      avgMerch: avg(subset.map((f) => f.avgMerch).filter((x): x is number => x != null)),
      avgMatch: avg(subset.map((f) => f.avgMatch).filter((x): x is number => x != null)),
      avgAssortment: avg(
        subset.map((f) => f.avgAssortment).filter((x): x is number => x != null)
      ),
      avgFocus: avg(subset.map((f) => f.avgFocus).filter((x): x is number => x != null)),
      avgMargin: avg(subset.map((f) => f.avgMargin).filter((x): x is number => x != null)),
      rows: subset,
    };
  }

  // Ranked with scores for top vs buried targets
  function scoreBreakdown(titleFilter: (t: string) => boolean, limit = 15) {
    return ranked
      .filter((r) => titleFilter(r.title || ""))
      .slice(0, limit)
      .map((r) => {
        const scores =
          r.scores && typeof r.scores === "object"
            ? (r.scores as Record<string, unknown>)
            : {};
        const assortment =
          scores.assortment && typeof scores.assortment === "object"
            ? (scores.assortment as Record<string, unknown>)
            : {};
        const focus =
          scores.productFocus && typeof scores.productFocus === "object"
            ? (scores.productFocus as Record<string, unknown>)
            : {};
        const pricing =
          r.pricing && typeof r.pricing === "object"
            ? (r.pricing as Record<string, unknown>)
            : {};
        return {
          rank: r.rank,
          title: (r.title || "").slice(0, 70),
          family: matchFamily(r.title || "") || "other",
          shopMatchPct: r.shopMatchPct,
          overallScore: r.overallScore,
          merch: num(scores.butikkscore) ?? num(scores.merchScore),
          assortmentTotal: num(assortment.total),
          assortmentHave: num(assortment.have),
          assortmentTarget: num(assortment.target),
          focusScore: num(focus.score),
          focusStars: num(focus.stars),
          margin: num(pricing.marginPct) ?? num(pricing.estimatedMarginPct),
        };
      });
  }

  const decisionFamilies = decisions.map((d) => ({
    at: d.at,
    familyId: d.familyId,
    label: d.label,
    query: d.query,
    needScore: d.needScore,
  }));

  // Chronological: first N candidates vs last N — family mix (search order proxy)
  const byCreated = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  function mixWindow(slice: typeof byCreated) {
    const m: Record<string, number> = {};
    for (const r of slice) {
      const fam = matchFamily(r.title || "") || "other";
      m[fam] = (m[fam] || 0) + 1;
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }

  const out = {
    meta: {
      runId: run.id,
      status: run.status,
      scanned: run.scanned,
      kept: run.kept,
      filtered: run.filtered,
      startedAt: run.startedAt,
      candidateRows: rows.length,
      rankedWithRank: ranked.length,
      decisionsLogged: decisions.length,
      currentDiscoveryFamily: discovery.currentFamilyId || null,
      currentQuery: discovery.currentQuery || null,
    },
    discoveryAttribution: {
      familyScanCounts,
      groupScanCounts,
      sumFamilyScan: Object.values(familyScanCounts).reduce((a, b) => a + b, 0),
      sumGroupScan: Object.values(groupScanCounts).reduce((a, b) => a + b, 0),
    },
    discoveryPlanNow: discoveryPlan?.now || null,
    recentDecisions: decisionFamilies.slice(-20),
    familyTable: familyTable.slice(0, 40),
    top100ByFam: Object.entries(top100ByFam)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, label: familyLabel(id) || id, n })),
    clusters: {
      gamingPeripherals: clusterStats(GAMING_FAMS),
      targetAccessories: clusterStats(TARGET_FAMS),
    },
    samples: {
      topGaming: scoreBreakdown(
        (t) =>
          GAMING_FAMS.includes(matchFamily(t) || "") ||
          /gaming\s*mouse|gaming\s*keyboard/i.test(t),
        8
      ),
      buriedTargets: scoreBreakdown(
        (t) => TARGET_FAMS.includes(matchFamily(t) || ""),
        20
      ),
      topOverall: ranked.slice(0, 15).map((r) => ({
        rank: r.rank,
        family: matchFamily(r.title || "") || "other",
        title: (r.title || "").slice(0, 60),
        match: r.shopMatchPct,
        merch:
          num(
            (r.scores as Record<string, unknown> | null)?.butikkscore
          ) ??
          num((r.scores as Record<string, unknown> | null)?.merchScore),
      })),
    },
    chronology: {
      first300: mixWindow(byCreated.slice(0, 300)),
      mid300: mixWindow(
        byCreated.slice(
          Math.max(0, Math.floor(byCreated.length / 2) - 150),
          Math.floor(byCreated.length / 2) + 150
        )
      ),
      last300: mixWindow(byCreated.slice(-300)),
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
