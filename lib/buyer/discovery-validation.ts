/**
 * Discovery Scheduler validation — logging & analysis only.
 * Does not change which family is chosen; documents why after the fact.
 */

/** Soft share targets — mirrored from hunt-store-builder (avoid deep imports). */
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

/** Mirrored from hunt-store-builder — keep in sync for validation only. */
function huntFatigueMultiplier(batchCount: number): number {
  if (batchCount >= 120) return 0.1;
  if (batchCount >= 80) return 0.3;
  if (batchCount >= 40) return 0.55;
  if (batchCount >= 20) return 0.75;
  if (batchCount >= 10) return 0.9;
  return 1;
}

export type DiscoveryObservedMetrics = {
  shopMatchPct: number | null;
  profitNOK: number | null;
  marginPct: number | null;
  deliveryDays: number | null;
  supplierRiskPct: number | null;
  demandScore: number | null;
  inventoryScore: number | null;
  merchScore: number | null;
  sampleCount: number;
};

export type DiscoveryDeferredFamily = {
  familyId: string;
  label: string;
  groupLabel: string;
  needScore: number;
  reasons: string[];
  fatiguePct: number;
  catalogHave: number;
  focusStars: number;
  onCooldown: boolean;
  groupSharePct: number;
  groupQuotaPct: number;
};

export type DiscoveryDecisionRecord = {
  at: string;
  familyId: string;
  label: string;
  /** Same taxonomy as group (Gaming / Mobil / …) */
  category: string;
  groupId: string;
  groupLabel: string;
  query: string;
  needScore: number;
  switchedFamily: boolean;
  pagesOnCurrent: number;
  forceAdvance: boolean;
  whyChosen: string[];
  deferred: DiscoveryDeferredFamily[];
  factors: {
    cooldown: boolean;
    fatiguePct: number;
    batchCount: number;
    catalogHave: number;
    target: number | null;
    focusStars: number;
    groupSharePct: number;
    groupQuotaPct: number;
    withinGroupQuota: boolean;
    assortmentGap: number | null;
  };
  /** Product pillars from hunt yield so far — not used by scheduler */
  observed: DiscoveryObservedMetrics | null;
  note: string;
};

export type DiscoverySummary = {
  title: "Discovery Summary";
  generatedAt: string;
  scanRunId: string;
  decisionCount: number;
  mostPrioritizedGroups: Array<{
    groupId: string;
    label: string;
    picks: number;
    sharePct: number;
  }>;
  mostDeferredGroups: Array<{
    groupId: string;
    label: string;
    deferredCount: number;
  }>;
  highFatigueFamilies: Array<{
    familyId: string;
    label: string;
    fatiguePct: number;
    batchCount: number;
  }>;
  lowFatigueFamilies: Array<{
    familyId: string;
    label: string;
    fatiguePct: number;
    batchCount: number;
  }>;
  groupDistribution: Array<{
    groupId: string;
    label: string;
    scanned: number;
    sharePct: number;
    quotaPct: number;
    deltaPct: number;
  }>;
  behavedAsExpected: boolean;
  expectationNotes: string[];
  summary: string;
  text: string;
};

export type DiscoveryFamilyFactorInput = {
  familyId: string;
  label: string;
  groupId: string;
  groupLabel: string;
  needScore: number;
  reason: string;
  catalogHave: number;
  target: number | null;
  batchCount: number;
  focusStars: number;
  onCooldown: boolean;
  groupShare: number;
  groupQuota: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Fatigue as percent pressure (0 = fresh, 90 = heavily fatigued). */
export function fatiguePctFromBatch(batchCount: number): number {
  const mult = huntFatigueMultiplier(batchCount);
  return round1((1 - mult) * 100);
}

function deferredReasons(
  chosen: DiscoveryFamilyFactorInput,
  other: DiscoveryFamilyFactorInput
): string[] {
  const reasons: string[] = [];
  const fat = fatiguePctFromBatch(other.batchCount);
  if (other.batchCount >= 40) {
    reasons.push(`For mange kandidater denne jakten (${other.batchCount})`);
  }
  if (fat >= 45) {
    reasons.push(`Fatigue ${fat} %`);
  }
  if (
    other.groupQuota > 0 &&
    other.groupShare >= other.groupQuota * 1.4
  ) {
    reasons.push("Gruppekvote oppfylt / overskredet");
  }
  if (other.onCooldown) {
    reasons.push("Cooldown (nylig valgt)");
  }
  if (chosen.needScore > other.needScore * 1.05) {
    reasons.push(
      `Sortiment trenger ${chosen.label} mer (need ${chosen.needScore.toFixed(1)} vs ${other.needScore.toFixed(1)})`
    );
  }
  if (other.catalogHave > 0 && chosen.catalogHave === 0) {
    reasons.push(`${chosen.label} mangler helt — høyere prioritet`);
  }
  if (other.focusStars < chosen.focusStars && chosen.focusStars >= 3) {
    reasons.push(`Lavere produktfokus (${other.focusStars} vs ${chosen.focusStars}★)`);
  }
  if (!reasons.length) {
    reasons.push(
      `Lavere need-score (${other.needScore.toFixed(1)} < ${chosen.needScore.toFixed(1)})`
    );
  }
  return reasons;
}

function whyChosenChecks(
  chosen: DiscoveryFamilyFactorInput,
  observed: DiscoveryObservedMetrics | null,
  switchedFamily: boolean,
  stayContinue: boolean
): string[] {
  const checks: string[] = [];
  const fat = fatiguePctFromBatch(chosen.batchCount);
  if (chosen.catalogHave === 0) checks.push("mangler i butikk");
  else if (
    chosen.target != null &&
    chosen.catalogHave < chosen.target * 0.5
  ) {
    checks.push("sterkt underdekket i sortiment");
  }
  if (chosen.focusStars >= 4) checks.push("høy fokus");
  else if (chosen.focusStars >= 2) checks.push(`fokus ${chosen.focusStars}★`);
  if (fat < 25) checks.push("lav fatigue");
  else if (fat < 50) checks.push(`moderat fatigue (${fat} %)`);
  if (chosen.groupShare <= chosen.groupQuota * 1.4) {
    checks.push("innenfor gruppekvote");
  } else {
    checks.push("gruppe over kvote — valgt likevel (høyest need)");
  }
  if (observed?.profitNOK != null && observed.profitNOK >= 80) {
    checks.push("høy profit (observert yield)");
  }
  if (observed?.marginPct != null && observed.marginPct >= 40) {
    checks.push("god margin (observert yield)");
  }
  if (observed?.deliveryDays != null && observed.deliveryDays <= 10) {
    checks.push("god levering (observert yield)");
  }
  if (observed?.shopMatchPct != null && observed.shopMatchPct >= 75) {
    checks.push("høy kvalitet / butikkmatch (observert yield)");
  }
  if (observed?.merchScore != null && observed.merchScore >= 70) {
    checks.push(`høy merch score ${observed.merchScore} (observert)`);
  }
  if (stayContinue) checks.push("fortsetter familie (paging)");
  else if (switchedFamily) checks.push("byttet til høyere prioritet");
  if (!checks.length) checks.push(chosen.reason || "høyest need-score");
  return checks;
}

/**
 * Build one decision record from scheduler inputs (post-choice).
 * Does not influence selection.
 */
export function buildDiscoveryDecisionRecord(input: {
  chosen: DiscoveryFamilyFactorInput;
  ranked: DiscoveryFamilyFactorInput[];
  switchedFamily: boolean;
  pagesOnCurrent: number;
  forceAdvance: boolean;
  query: string;
  observedByFamily?: Record<string, DiscoveryObservedMetrics> | null;
}): DiscoveryDecisionRecord {
  const { chosen } = input;
  const observed = input.observedByFamily?.[chosen.familyId] || null;
  const stayContinue =
    !input.switchedFamily && input.pagesOnCurrent > 0 && !input.forceAdvance;

  const deferred = input.ranked
    .filter((r) => r.familyId !== chosen.familyId)
    .slice(0, 5)
    .map((r) => ({
      familyId: r.familyId,
      label: r.label,
      groupLabel: r.groupLabel,
      needScore: round1(r.needScore),
      reasons: deferredReasons(chosen, r),
      fatiguePct: fatiguePctFromBatch(r.batchCount),
      catalogHave: r.catalogHave,
      focusStars: r.focusStars,
      onCooldown: r.onCooldown,
      groupSharePct: round1(r.groupShare * 100),
      groupQuotaPct: round1(r.groupQuota * 100),
    }));

  const assortmentGap =
    chosen.target != null
      ? Math.max(0, chosen.target - (chosen.catalogHave + chosen.batchCount))
      : null;

  return {
    at: new Date().toISOString(),
    familyId: chosen.familyId,
    label: chosen.label,
    category: chosen.groupLabel,
    groupId: chosen.groupId,
    groupLabel: chosen.groupLabel,
    query: input.query,
    needScore: round1(chosen.needScore),
    switchedFamily: input.switchedFamily,
    pagesOnCurrent: input.pagesOnCurrent,
    forceAdvance: Boolean(input.forceAdvance),
    whyChosen: whyChosenChecks(
      chosen,
      observed,
      input.switchedFamily,
      stayContinue
    ),
    deferred,
    factors: {
      cooldown: chosen.onCooldown,
      fatiguePct: fatiguePctFromBatch(chosen.batchCount),
      batchCount: chosen.batchCount,
      catalogHave: chosen.catalogHave,
      target: chosen.target,
      focusStars: chosen.focusStars,
      groupSharePct: round1(chosen.groupShare * 100),
      groupQuotaPct: round1(chosen.groupQuota * 100),
      withinGroupQuota: chosen.groupShare <= chosen.groupQuota * 1.4,
      assortmentGap,
    },
    observed,
    note:
      "Produktpillars (profit/margin/merch m.m.) er observert yield fra jakten — ikke input til Discovery Scheduler.",
  };
}

/** Human-readable decision log (console / admin). */
export function formatDiscoveryDecisionLog(
  d: DiscoveryDecisionRecord
): string {
  const lines: string[] = [
    "Discovery:",
    d.label,
    `Tid: ${d.at}`,
    `Kategori/Gruppe: ${d.category} (${d.groupId})`,
    `Query: "${d.query}"`,
    `Need: ${d.needScore}`,
    "",
    "Valgt fordi:",
    ...d.whyChosen.map((c) => `✔ ${c}`),
    "",
    `Cooldown: ${d.factors.cooldown ? "ja" : "nei"}`,
    `Fatigue: ${d.factors.fatiguePct} % (batch ${d.factors.batchCount})`,
    `Sortiment: have ${d.factors.catalogHave}` +
      (d.factors.target != null ? ` / mål ${d.factors.target}` : "") +
      (d.factors.assortmentGap != null
        ? ` · gap ${d.factors.assortmentGap}`
        : ""),
    `Produktfokus: ${d.factors.focusStars}★`,
    `Gruppeandel: ${d.factors.groupSharePct} % (kvote ${d.factors.groupQuotaPct} %)`,
  ];

  if (d.observed && d.observed.sampleCount > 0) {
    lines.push(
      "",
      `Observert yield (n=${d.observed.sampleCount}) — ikke brukt til valg:`,
      `  Butikkmatch: ${fmt(d.observed.shopMatchPct, " %")}`,
      `  Profit: ${fmt(d.observed.profitNOK, " NOK")}`,
      `  Margin: ${fmt(d.observed.marginPct, " %")}`,
      `  Levering: ${fmt(d.observed.deliveryDays, " d")}`,
      `  Supplier Risk: ${fmt(d.observed.supplierRiskPct, " %")}`,
      `  Demand: ${fmt(d.observed.demandScore)}`,
      `  Inventory: ${fmt(d.observed.inventoryScore)}`,
      `  Merch Score: ${fmt(d.observed.merchScore)}`
    );
  } else {
    lines.push(
      "",
      "Observert yield: — (ingen kandidater ennå for familien)"
    );
  }

  if (d.deferred.length) {
    lines.push("", "Utsatt:");
    for (const u of d.deferred) {
      lines.push(u.label);
      lines.push("Årsak:");
      for (const r of u.reasons) lines.push(`  ${r}`);
      lines.push(`  Fatigue ${u.fatiguePct} % · need ${u.needScore}`);
      lines.push("");
    }
  }

  lines.push(d.note);
  return lines.join("\n");
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${round1(n)}${suffix}`;
}

/**
 * End-of-hunt summary from decision log + final discovery state counts.
 */
export function buildDiscoverySummary(input: {
  scanRunId: string;
  decisions: DiscoveryDecisionRecord[];
  familyScanCounts: Record<string, number>;
  groupScanCounts: Record<string, number>;
  familyLabels?: Record<string, string>;
}): DiscoverySummary {
  const decisions = input.decisions || [];
  const pickByGroup: Record<string, { label: string; picks: number }> = {};
  const deferredByGroup: Record<string, { label: string; n: number }> = {};

  for (const d of decisions) {
    const g = pickByGroup[d.groupId] || {
      label: d.groupLabel,
      picks: 0,
    };
    g.picks += 1;
    pickByGroup[d.groupId] = g;

    for (const u of d.deferred) {
      const key = u.groupLabel;
      const cur = deferredByGroup[key] || { label: key, n: 0 };
      cur.n += 1;
      deferredByGroup[key] = cur;
    }
  }

  const totalPicks = Math.max(
    1,
    Object.values(pickByGroup).reduce((a, b) => a + b.picks, 0)
  );
  const mostPrioritizedGroups = Object.entries(pickByGroup)
    .map(([groupId, v]) => ({
      groupId,
      label: v.label,
      picks: v.picks,
      sharePct: round1((v.picks / totalPicks) * 100),
    }))
    .sort((a, b) => b.picks - a.picks);

  const mostDeferredGroups = Object.values(deferredByGroup)
    .map((v) => ({
      groupId: v.label,
      label: v.label,
      deferredCount: v.n,
    }))
    .sort((a, b) => b.deferredCount - a.deferredCount);

  const familyFatigue = Object.entries(input.familyScanCounts).map(
    ([familyId, batchCount]) => ({
      familyId,
      label: input.familyLabels?.[familyId] || familyId,
      batchCount,
      fatiguePct: fatiguePctFromBatch(batchCount),
    })
  );

  const highFatigueFamilies = [...familyFatigue]
    .filter((f) => f.fatiguePct >= 45)
    .sort((a, b) => b.fatiguePct - a.fatiguePct)
    .slice(0, 10);

  const lowFatigueFamilies = [...familyFatigue]
    .filter((f) => f.batchCount > 0 && f.fatiguePct < 25)
    .sort((a, b) => a.fatiguePct - b.fatiguePct)
    .slice(0, 10);

  const totalScanned = Math.max(
    1,
    Object.values(input.groupScanCounts).reduce((a, b) => a + b, 0)
  );
  const GROUP_LABELS: Record<string, string> = {
    pc_gaming: "Gaming",
    mobil: "Mobil",
    kontor: "Kontor",
    streaming: "Streaming",
    tv_lyd: "TV & Lyd",
    smart_home: "Smart Home",
    data_it: "Data & IT",
    maker: "Maker",
  };

  const groupDistribution = Object.keys(HUNT_GROUP_QUOTAS)
    .map((groupId) => {
      const scanned = input.groupScanCounts[groupId] || 0;
      const sharePct = round1((scanned / totalScanned) * 100);
      const quotaPct = round1((HUNT_GROUP_QUOTAS[groupId] || 0) * 100);
      return {
        groupId,
        label: GROUP_LABELS[groupId] || groupId,
        scanned,
        sharePct,
        quotaPct,
        deltaPct: round1(sharePct - quotaPct),
      };
    })
    .sort((a, b) => b.sharePct - a.sharePct);

  // Overlay labels from decisions when available
  for (const g of groupDistribution) {
    const fromPick = mostPrioritizedGroups.find((p) => p.groupId === g.groupId);
    if (fromPick) g.label = fromPick.label;
  }

  const expectationNotes: string[] = [];
  let behavedAsExpected = true;

  const top = mostPrioritizedGroups[0];
  if (top && top.sharePct >= 55) {
    behavedAsExpected = false;
    expectationNotes.push(
      `Én gruppe dominerte beslutningene: ${top.label} ${top.sharePct} % av picks (forventet mer rotasjon).`
    );
  }

  const overQuota = groupDistribution.filter((g) => g.deltaPct >= 20);
  if (overQuota.length) {
    behavedAsExpected = false;
    expectationNotes.push(
      `Gruppeandel langt over kvote: ${overQuota
        .map((g) => `${g.label} ${g.sharePct}% (mål ${g.quotaPct}%)`)
        .join("; ")}.`
    );
  }

  const stuckFatigue = highFatigueFamilies.filter((f) => f.batchCount >= 80);
  if (stuckFatigue.length && decisions.length >= 5) {
    const stillPicked = stuckFatigue.filter((f) =>
      decisions.slice(-8).some((d) => d.familyId === f.familyId)
    );
    if (stillPicked.length) {
      behavedAsExpected = false;
      expectationNotes.push(
        `Høy-fatigue familier ble fortsatt valgt sent i jakten: ${stillPicked
          .map((f) => f.label)
          .join(", ")}.`
      );
    }
  }

  if (decisions.length === 0) {
    behavedAsExpected = false;
    expectationNotes.push(
      "Ingen Discovery-beslutninger logget (jakt uten scheduler, eller kun paging uten resolve)."
    );
  }

  if (behavedAsExpected && decisions.length > 0) {
    expectationNotes.push(
      "Scheduler roterte familier, respekterte delvis kvoter/fatigue, og prioriterte hull/fokus."
    );
  }

  const summaryParts: string[] = [];
  if (decisions.length === 0) {
    summaryParts.push("Ingen Discovery-beslutninger å oppsummere.");
  } else {
    summaryParts.push(
      `${decisions.length} Discovery-beslutninger logget`
    );
    if (top) {
      summaryParts.push(
        `mest prioritert: ${top.label} (${top.sharePct} % av picks)`
      );
    }
    if (mostDeferredGroups[0]) {
      summaryParts.push(
        `mest utsatt gruppe: ${mostDeferredGroups[0].label}`
      );
    }
    summaryParts.push(
      behavedAsExpected
        ? "oppførsel som forventet"
        : "avvik fra forventet oppførsel — se merknader"
    );
  }

  const summary: DiscoverySummary = {
    title: "Discovery Summary",
    generatedAt: new Date().toISOString(),
    scanRunId: input.scanRunId,
    decisionCount: decisions.length,
    mostPrioritizedGroups,
    mostDeferredGroups,
    highFatigueFamilies,
    lowFatigueFamilies,
    groupDistribution,
    behavedAsExpected,
    expectationNotes,
    summary: summaryParts.join(". ") + ".",
    text: "",
  };
  summary.text = formatDiscoverySummaryText(summary);
  return summary;
}

export function formatDiscoverySummaryText(s: DiscoverySummary): string {
  const lines: string[] = [
    "Discovery Summary",
    `scanRunId: ${s.scanRunId}`,
    `generatedAt: ${s.generatedAt}`,
    `Beslutninger: ${s.decisionCount}`,
    "",
    "Mest prioriterte grupper:",
    ...(s.mostPrioritizedGroups.length
      ? s.mostPrioritizedGroups.map(
          (g) => `  ${g.label}: ${g.picks} picks (${g.sharePct} %)`
        )
      : ["  (ingen)"]),
    "",
    "Mest utsatte grupper:",
    ...(s.mostDeferredGroups.length
      ? s.mostDeferredGroups.map(
          (g) => `  ${g.label}: utsatt ${g.deferredCount} ganger`
        )
      : ["  (ingen)"]),
    "",
    "Familier med høy fatigue:",
    ...(s.highFatigueFamilies.length
      ? s.highFatigueFamilies.map(
          (f) =>
            `  ${f.label}: fatigue ${f.fatiguePct} % (batch ${f.batchCount})`
        )
      : ["  (ingen)"]),
    "",
    "Familier med lav fatigue:",
    ...(s.lowFatigueFamilies.length
      ? s.lowFatigueFamilies.map(
          (f) =>
            `  ${f.label}: fatigue ${f.fatiguePct} % (batch ${f.batchCount})`
        )
      : ["  (ingen)"]),
    "",
    "Gruppefordeling (scannet yield):",
    ...s.groupDistribution.map(
      (g) =>
        `  ${g.label}: ${g.scanned} (${g.sharePct} %) mål ${g.quotaPct} % avvik ${
          g.deltaPct > 0 ? "+" : ""
        }${g.deltaPct} %`
    ),
    "",
    `Oppførte seg som forventet: ${s.behavedAsExpected ? "ja" : "nei"}`,
    ...s.expectationNotes.map((n) => `  — ${n}`),
    "",
    `Oppsummering: ${s.summary}`,
  ];
  return lines.join("\n");
}

/** Merge running averages for observed product pillars. */
export function mergeObservedMetrics(
  prev: DiscoveryObservedMetrics | undefined,
  sample: Omit<DiscoveryObservedMetrics, "sampleCount">
): DiscoveryObservedMetrics {
  const n0 = prev?.sampleCount || 0;
  const n1 = n0 + 1;
  const mix = (a: number | null | undefined, b: number | null | undefined) => {
    if (b == null || !Number.isFinite(b)) return a ?? null;
    if (a == null || !Number.isFinite(a) || n0 === 0) return b;
    return round1((a * n0 + b) / n1);
  };
  return {
    shopMatchPct: mix(prev?.shopMatchPct, sample.shopMatchPct),
    profitNOK: mix(prev?.profitNOK, sample.profitNOK),
    marginPct: mix(prev?.marginPct, sample.marginPct),
    deliveryDays: mix(prev?.deliveryDays, sample.deliveryDays),
    supplierRiskPct: mix(prev?.supplierRiskPct, sample.supplierRiskPct),
    demandScore: mix(prev?.demandScore, sample.demandScore),
    inventoryScore: mix(prev?.inventoryScore, sample.inventoryScore),
    merchScore: mix(prev?.merchScore, sample.merchScore),
    sampleCount: n1,
  };
}

export function parseDiscoveryValidation(raw: unknown): {
  decisions: DiscoveryDecisionRecord[];
  summary: DiscoverySummary | null;
  observedByFamily: Record<string, DiscoveryObservedMetrics>;
} {
  const empty = {
    decisions: [] as DiscoveryDecisionRecord[],
    summary: null as DiscoverySummary | null,
    observedByFamily: {} as Record<string, DiscoveryObservedMetrics>,
  };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const decisions = Array.isArray(o.decisions)
    ? (o.decisions as DiscoveryDecisionRecord[])
    : [];
  const summary =
    o.summary &&
    typeof o.summary === "object" &&
    (o.summary as DiscoverySummary).title === "Discovery Summary"
      ? (o.summary as DiscoverySummary)
      : null;
  const observedByFamily =
    o.observedByFamily && typeof o.observedByFamily === "object"
      ? (o.observedByFamily as Record<string, DiscoveryObservedMetrics>)
      : {};
  return { decisions, summary, observedByFamily };
}
