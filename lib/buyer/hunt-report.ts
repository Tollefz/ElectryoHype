/**
 * AI Product Hunt Report — factual post-hunt assortment report.
 * Built from candidate + strategy data only (no LLM / guessing).
 */

import {
  FOCUS_GROUP_DEFS,
  primaryGroupForFamily,
} from "@/lib/buyer/product-focus-core";
import { familyLabel, matchFamily } from "@/lib/intelligence/families";

/** Same soft share targets as hunt-store-builder (inlined — avoid server-only import chain). */
const HUNT_GROUP_QUOTAS: Record<string, number> = {
  pc_gaming: 0.3,
  mobil: 0.15,
  kontor: 0.1,
  streaming: 0.1,
  tv_lyd: 0.1,
  smart_home: 0.1,
  data_it: 0.1,
  maker: 0.05,
};

/** Families that exist in matchFamily but are not listed in FOCUS_GROUP_DEFS. */
const FAMILY_GROUP_FALLBACK: Record<string, string> = {
  phone_case: "mobil",
  screen_protector: "mobil",
  battery_charger: "mobil",
  mouse: "pc_gaming",
  keyboard: "pc_gaming",
  wireless_mouse: "pc_gaming",
  bluetooth_mouse: "pc_gaming",
  travel_mouse: "pc_gaming",
  vertical_mouse: "kontor",
  office_mouse: "kontor",
  car_bt_adapter: "bil",
  car_charger: "bil",
  fpv_drone: "maker",
  adapter: "mobil",
  other: "other",
};

function groupIdForFamily(familyId: string): string {
  const primary = primaryGroupForFamily(familyId)?.id;
  if (primary) return primary;
  return FAMILY_GROUP_FALLBACK[familyId] || "other";
}

/** Mirrors merch-brain / supplier-risk — kept local so this module stays client-safe. */
function supplierRiskFromChanges(changes7d: number): number {
  if (changes7d >= 9) return 82;
  if (changes7d >= 6) return 65;
  if (changes7d >= 3) return 40;
  if (changes7d >= 1) return 18;
  return 5;
}

function scoreInventory(stock: number | null | undefined): number {
  if (stock == null || !Number.isFinite(stock)) return 48;
  if (stock <= 0) return 5;
  if (stock < 5) return 15;
  if (stock < 20) return 40;
  if (stock < 50) return 58;
  if (stock < 150) return 75;
  if (stock < 400) return 88;
  return 96;
}

function scoreDemand(input: {
  listedCount?: number | null;
  rating?: number | null;
  retailNOK?: number | null;
  overallScore?: number | null;
}): number {
  let s = 40;
  const listed = input.listedCount ?? 0;
  if (listed >= 200 && listed <= 5000) s += 22;
  else if (listed > 5000 && listed <= 15000) s += 14;
  else if (listed > 15000) s += 4;
  else if (listed > 50) s += 10;
  const rating = input.rating ?? 0;
  if (rating >= 4.7) s += 18;
  else if (rating >= 4.3) s += 12;
  else if (rating >= 3.8) s += 6;
  if (input.overallScore != null && input.overallScore >= 75) s += 8;
  else if (input.overallScore != null && input.overallScore >= 60) s += 4;
  return Math.max(0, Math.min(100, s));
}

export type HuntReportShareRow = {
  id: string;
  label: string;
  count: number;
  sharePct: number;
  /** Target share (0–100) or null when no quota */
  targetPct: number | null;
  /** Absolute assortment target count or null */
  targetCount: number | null;
  /** sharePct − targetPct */
  deltaPct: number | null;
  /** count − targetCount */
  deltaCount: number | null;
};

export type HuntReportAverages = {
  marginPct: number | null;
  profitNOK: number | null;
  deliveryDays: number | null;
  landedCostNOK: number | null;
  supplierRiskPct: number | null;
  inventoryScore: number | null;
  demandScore: number | null;
  economicConfidence: number | null;
};

export type ProductHuntReport = {
  title: "AI Product Hunt Report";
  generatedAt: string;
  scanRunId: string;
  analyzed: number;
  approvedCandidates: number;
  published: number;
  discarded: number;
  /** Ranked best-in-group used for mix */
  mixBaseCount: number;
  categories: HuntReportShareRow[];
  families: HuntReportShareRow[];
  top10Families: HuntReportShareRow[];
  underrepresented: HuntReportShareRow[];
  overrepresented: HuntReportShareRow[];
  averages: HuntReportAverages;
  /** Short Norwegian summary from numbers only */
  summary: string;
  /** Full plain-text report for logs */
  text: string;
};

export type HuntReportCandidate = {
  title: string;
  status: string;
  shopMatchPct: number;
  overallScore: number;
  pricing?: unknown;
  snapshot?: unknown;
  scores?: unknown;
};

export type BuildHuntReportInput = {
  scanRunId: string;
  analyzed: number;
  discarded: number;
  published: number;
  approvedCandidates: number;
  candidates: HuntReportCandidate[];
  /** Assortment strategy absolute targets by familyId */
  familyTargets?: Record<string, number> | null;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function parsePricing(pricing: unknown) {
  const p =
    pricing && typeof pricing === "object"
      ? (pricing as Record<string, unknown>)
      : {};
  const margin =
    num(p.marginPct) ?? num(p.estimatedMarginPct) ?? num(p.grossMarginPct);
  const retail = num(p.retailNOK) ?? num(p.estimatedRetailNOK);
  const landed = num(p.landedCostNOK);
  const profit =
    num(p.marginNOK) ??
    (retail != null && landed != null ? retail - landed : null);
  const econ =
    p.economic && typeof p.economic === "object"
      ? (p.economic as Record<string, unknown>)
      : null;
  const economicConfidence =
    num(p.economicConfidence) ?? num(econ?.confidence);
  return { margin, retail, landed, profit, economicConfidence };
}

function parseSnapshot(snapshot: unknown) {
  const s =
    snapshot && typeof snapshot === "object"
      ? (snapshot as Record<string, unknown>)
      : {};
  const deliveryHint =
    (typeof s.deliveryHint === "string" && s.deliveryHint) ||
    (typeof s.deliveryTime === "string" && s.deliveryTime) ||
    null;
  return {
    deliveryHint,
    deliveryDays: num(s.deliveryDays),
    stock: num(s.stock),
    listedCount: num(s.listedCount),
    rating: num(s.rating),
    priceChanges7d: num(s.priceChanges7d) ?? num(s.priceChanges),
    categoryHint:
      (typeof s.categoryHint === "string" && s.categoryHint) ||
      (typeof s.category === "string" && s.category) ||
      null,
  };
}

function deliveryDaysOf(snap: ReturnType<typeof parseSnapshot>): number | null {
  if (snap.deliveryDays != null) return snap.deliveryDays;
  if (!snap.deliveryHint) return null;
  const m = String(snap.deliveryHint).match(/(\d+)\s*[-–]?\s*(\d+)?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (!Number.isFinite(a)) return null;
  return Math.round((a + b) / 2);
}

function isApprovedMix(c: HuntReportCandidate): boolean {
  return (
    (c.status === "ranked" ||
      c.status === "imported" ||
      c.status === "queued") &&
    c.shopMatchPct >= 65 &&
    c.overallScore >= 55
  );
}

/** Core + supplementary family ids known to the store builder. */
function knownFamilyIds(): Array<{ id: string; label: string; groupId: string }> {
  const out: Array<{ id: string; label: string; groupId: string }> = [];
  const seen = new Set<string>();
  for (const g of FOCUS_GROUP_DEFS) {
    for (const f of [...g.core, ...g.supplementary]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ id: f.id, label: f.label, groupId: g.id });
    }
  }
  return out;
}

function shareRow(input: {
  id: string;
  label: string;
  count: number;
  total: number;
  targetPct: number | null;
  targetCount: number | null;
}): HuntReportShareRow {
  const sharePct =
    input.total > 0 ? round1((input.count / input.total) * 100) : 0;
  const deltaPct =
    input.targetPct != null ? round1(sharePct - input.targetPct) : null;
  const deltaCount =
    input.targetCount != null ? input.count - input.targetCount : null;
  return {
    id: input.id,
    label: input.label,
    count: input.count,
    sharePct,
    targetPct: input.targetPct,
    targetCount: input.targetCount,
    deltaPct,
    deltaCount,
  };
}

/**
 * Build factual hunt report. Mix uses quality-approved candidates.
 */
export function buildProductHuntReport(
  input: BuildHuntReportInput
): ProductHuntReport {
  const mix = input.candidates.filter(isApprovedMix);
  const total = mix.length;

  const byFamily: Record<string, number> = {};
  const byGroup: Record<string, number> = {};

  const margins: number[] = [];
  const profits: number[] = [];
  const deliveryDaysArr: number[] = [];
  const landeds: number[] = [];
  const risks: number[] = [];
  const inventories: number[] = [];
  const demands: number[] = [];
  const econs: number[] = [];

  for (const c of mix) {
    const fam = matchFamily(c.title) || "other";
    byFamily[fam] = (byFamily[fam] || 0) + 1;
    const g = groupIdForFamily(fam);
    byGroup[g] = (byGroup[g] || 0) + 1;

    const pr = parsePricing(c.pricing);
    const snap = parseSnapshot(c.snapshot);
    if (pr.margin != null) margins.push(pr.margin);
    if (pr.profit != null) profits.push(pr.profit);
    if (pr.landed != null) landeds.push(pr.landed);
    if (pr.economicConfidence != null) econs.push(pr.economicConfidence);

    const days = deliveryDaysOf(snap);
    if (days != null) deliveryDaysArr.push(days);

    risks.push(supplierRiskFromChanges(snap.priceChanges7d ?? 0));
    inventories.push(scoreInventory(snap.stock));
    demands.push(
      scoreDemand({
        listedCount: snap.listedCount,
        rating: snap.rating,
        retailNOK: pr.retail,
        overallScore: c.overallScore,
      })
    );
  }

  const categories: HuntReportShareRow[] = FOCUS_GROUP_DEFS.map((g) => {
    const quota = HUNT_GROUP_QUOTAS[g.id];
    return shareRow({
      id: g.id,
      label: g.shortLabel || g.label,
      count: byGroup[g.id] || 0,
      total,
      targetPct: quota != null ? round1(quota * 100) : null,
      targetCount: null,
    });
  });
  if (byGroup.other) {
    categories.push(
      shareRow({
        id: "other",
        label: "Annet",
        count: byGroup.other,
        total,
        targetPct: null,
        targetCount: null,
      })
    );
  }
  if (
    HUNT_GROUP_QUOTAS.data_it != null &&
    !categories.some((c) => c.id === "data_it")
  ) {
    categories.push(
      shareRow({
        id: "data_it",
        label: "Data & IT",
        count: byGroup.data_it || 0,
        total,
        targetPct: round1(HUNT_GROUP_QUOTAS.data_it * 100),
        targetCount: null,
      })
    );
  }

  const known = knownFamilyIds();
  const familyIds = new Set([
    ...known.map((k) => k.id),
    ...Object.keys(byFamily),
  ]);
  const families: HuntReportShareRow[] = [...familyIds]
    .map((id) => {
      const knownDef = known.find((k) => k.id === id);
      const targetCount =
        input.familyTargets && input.familyTargets[id] != null
          ? input.familyTargets[id]
          : null;
      let targetPct: number | null = null;
      if (targetCount != null && input.familyTargets) {
        const sumTargets = Object.values(input.familyTargets).reduce(
          (a, b) => a + (Number(b) || 0),
          0
        );
        if (sumTargets > 0) {
          targetPct = round1((targetCount / sumTargets) * 100);
        }
      }
      return shareRow({
        id,
        label: knownDef?.label || familyLabel(id) || id,
        count: byFamily[id] || 0,
        total,
        targetPct,
        targetCount,
      });
    })
    .filter((r) => r.count > 0 || (r.targetCount != null && r.targetCount > 0))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "nb"));

  const top10Families = families.filter((f) => f.count > 0).slice(0, 10);

  const overrepresented = [...families]
    .filter((f) => {
      if (f.deltaPct != null) return f.deltaPct >= 5;
      if (f.deltaCount != null) return f.deltaCount >= 3;
      return f.sharePct >= 12 && f.count >= 5;
    })
    .sort(
      (a, b) =>
        (b.deltaPct ?? b.sharePct) - (a.deltaPct ?? a.sharePct) ||
        b.count - a.count
    )
    .slice(0, 10);

  const underrepresented = [...families]
    .filter((f) => {
      if (f.deltaPct != null) return f.deltaPct <= -3 || f.count === 0;
      if (f.deltaCount != null) return f.deltaCount <= -2 || f.count === 0;
      const isCore = FOCUS_GROUP_DEFS.some((g) =>
        g.core.some((c) => c.id === f.id)
      );
      return isCore && f.count === 0;
    })
    .sort(
      (a, b) =>
        (a.deltaPct ?? -100) - (b.deltaPct ?? -100) ||
        a.count - b.count ||
        a.label.localeCompare(b.label, "nb")
    )
    .slice(0, 12);

  const zeroCore = known
    .filter((k) =>
      FOCUS_GROUP_DEFS.some((g) => g.core.some((c) => c.id === k.id))
    )
    .filter((k) => !byFamily[k.id])
    .slice(0, 8)
    .map((k) =>
      shareRow({
        id: k.id,
        label: k.label,
        count: 0,
        total,
        targetPct: null,
        targetCount:
          input.familyTargets && input.familyTargets[k.id] != null
            ? input.familyTargets[k.id]
            : null,
      })
    );
  for (const z of zeroCore) {
    if (!underrepresented.some((u) => u.id === z.id)) {
      underrepresented.push(z);
    }
  }

  const averages: HuntReportAverages = {
    marginPct: avg(margins),
    profitNOK: avg(profits),
    deliveryDays: avg(deliveryDaysArr),
    landedCostNOK: avg(landeds),
    supplierRiskPct: avg(risks),
    inventoryScore: avg(inventories),
    demandScore: avg(demands),
    economicConfidence: avg(econs),
  };

  const summary = buildFactualSummary({
    mixCount: total,
    categories,
    overrepresented,
    underrepresented,
    averages,
  });

  const report: ProductHuntReport = {
    title: "AI Product Hunt Report",
    generatedAt: new Date().toISOString(),
    scanRunId: input.scanRunId,
    analyzed: input.analyzed,
    approvedCandidates: input.approvedCandidates,
    published: input.published,
    discarded: input.discarded,
    mixBaseCount: total,
    categories,
    families,
    top10Families,
    underrepresented: underrepresented.slice(0, 12),
    overrepresented: overrepresented.slice(0, 10),
    averages,
    summary,
    text: "",
  };
  report.text = formatHuntReportText(report);
  return report;
}

/** Template summary from measured shares only — no generative AI. */
export function buildFactualSummary(input: {
  mixCount: number;
  categories: HuntReportShareRow[];
  overrepresented: HuntReportShareRow[];
  underrepresented: HuntReportShareRow[];
  averages: HuntReportAverages;
}): string {
  if (input.mixCount <= 0) {
    return "Jakten fant ingen godkjente kandidater. Ingen kategori-balanse å vurdere.";
  }

  const rankedCats = [...input.categories]
    .filter((c) => c.id !== "other")
    .sort((a, b) => b.sharePct - a.sharePct);
  const top = rankedCats[0];
  const weak = [...rankedCats]
    .filter((c) =>
      c.targetPct != null ? c.sharePct < c.targetPct * 0.5 : c.sharePct < 3
    )
    .sort((a, b) => a.sharePct - b.sharePct)
    .slice(0, 2);

  const balanceOk =
    top &&
    (top.targetPct == null || Math.abs(top.deltaPct ?? 0) < 12) &&
    top.sharePct < 40;

  const parts: string[] = [];
  if (balanceOk) {
    parts.push(
      `Jakten ga en god balanse blant ${input.mixCount} godkjente kandidater`
    );
  } else if (top) {
    parts.push(
      `Jakten ga ${input.mixCount} godkjente kandidater, men ${top.label} utgjør ${top.sharePct} % av mixen` +
        (top.targetPct != null ? ` (mål ${top.targetPct} %)` : "")
    );
  } else {
    parts.push(`Jakten ga ${input.mixCount} godkjente kandidater`);
  }

  if (weak.length) {
    parts.push(
      `${weak.map((w) => w.label).join(" og ")} er fortsatt svak` +
        (weak[0].sharePct === 0
          ? ""
          : ` (${weak.map((w) => `${w.sharePct} %`).join(", ")})`)
    );
  }

  const nextFamilies = input.underrepresented
    .filter((f) => f.count === 0)
    .slice(0, 2)
    .map((f) => f.label);
  if (nextFamilies.length) {
    parts.push(
      `Discovery anbefaler å prioritere ${nextFamilies.join(" og ")} neste jakt`
    );
  } else if (input.underrepresented.length) {
    const u = input.underrepresented[0];
    parts.push(
      `${u.label} er underrepresentert` +
        (u.deltaPct != null ? ` (avvik ${u.deltaPct} %)` : "")
    );
  }

  if (input.averages.marginPct != null) {
    parts.push(`Snittmargin ${input.averages.marginPct} %`);
  }

  let text = parts[0];
  for (let i = 1; i < parts.length; i++) {
    text += `. ${parts[i]}`;
  }
  if (!text.endsWith(".")) text += ".";
  return text;
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${n} %`;
}

function fmtNum(n: number | null, suffix = ""): string {
  return n == null ? "—" : `${n}${suffix}`;
}

function rowLine(r: HuntReportShareRow): string {
  const mål =
    r.targetPct != null
      ? fmtPct(r.targetPct)
      : r.targetCount != null
        ? String(r.targetCount)
        : "—";
  const avvik =
    r.deltaPct != null
      ? `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct} %`
      : r.deltaCount != null
        ? `${r.deltaCount > 0 ? "+" : ""}${r.deltaCount}`
        : "—";
  return `  ${r.label}: antall=${r.count} andel=${r.sharePct} % mål=${mål} avvik=${avvik}`;
}

/** Plain-text report for server logs. */
export function formatHuntReportText(report: ProductHuntReport): string {
  const lines: string[] = [
    "AI Product Hunt Report",
    `scanRunId: ${report.scanRunId}`,
    `generatedAt: ${report.generatedAt}`,
    "",
    `Analysert: ${report.analyzed}`,
    `Godkjente kandidater: ${report.approvedCandidates}`,
    `Publiserte: ${report.published}`,
    `Forkastet: ${report.discarded}`,
    `Mix-grunnlag (godkjente i rapport): ${report.mixBaseCount}`,
    "",
    "Kategori-fordeling:",
    ...report.categories.map(rowLine),
    "",
    "Produktfamilier (topp + mål):",
    ...report.families.slice(0, 40).map(rowLine),
    "",
    "Topp 10 familier:",
    ...report.top10Families.map(
      (r, i) => `  ${i + 1}. ${r.label}: ${r.count} (${r.sharePct} %)`
    ),
    "",
    "Underrepresenterte familier:",
    ...(report.underrepresented.length
      ? report.underrepresented.map(rowLine)
      : ["  (ingen)"]),
    "",
    "Overrepresenterte familier:",
    ...(report.overrepresented.length
      ? report.overrepresented.map(rowLine)
      : ["  (ingen)"]),
    "",
    "Gjennomsnitt:",
    `  Margin: ${fmtPct(report.averages.marginPct)}`,
    `  Profit: ${fmtNum(report.averages.profitNOK, " NOK")}`,
    `  Leveringstid: ${fmtNum(report.averages.deliveryDays, " dager")}`,
    `  Landed Cost: ${fmtNum(report.averages.landedCostNOK, " NOK")}`,
    `  Supplier Risk: ${fmtPct(report.averages.supplierRiskPct)}`,
    `  Inventory Score: ${fmtNum(report.averages.inventoryScore)}`,
    `  Demand Score: ${fmtNum(report.averages.demandScore)}`,
    `  Økonomisk sikkerhet: ${fmtPct(report.averages.economicConfidence)}`,
    "",
    `Oppsummering: ${report.summary}`,
  ];
  return lines.join("\n");
}

export function parseHuntReport(raw: unknown): ProductHuntReport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ProductHuntReport>;
  if (o.title !== "AI Product Hunt Report") return null;
  if (typeof o.scanRunId !== "string") return null;
  return raw as ProductHuntReport;
}
