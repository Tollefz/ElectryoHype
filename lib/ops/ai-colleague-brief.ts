/**
 * Natural-language AI colleague brief for Rob's Desk.
 * Story first — not raw metrics. Defensive against missing data.
 * Attention / failures come from deskAttentionFromQueues (single source of truth).
 */

import { deskAttentionFromQueues } from "@/lib/ops/desk-attention";

export type DeskAction = {
  id: string;
  label: string;
  href: string;
  urgency: "green" | "yellow" | "red";
  count: number;
};

export type ColleagueBriefInput = {
  hour?: number;
  adminName?: string | null;
  morningBrief?: string | null;
  autonomySummary?: Record<string, number> | null;
  buyerMission?: {
    analyzed?: number;
    discarded?: number;
    candidates?: number;
    passedQualityGate?: number;
    readyToPublish?: number;
    imported?: number;
  } | null;
  merchSuggested?: number;
  readyToPublish?: number;
  improvePending?: number;
  priceChangePending?: number;
  paidNewOrders?: number;
  catalogIssuesHigh?: number;
  performanceProblems?: number;
  buyerRanked?: number;
  aiReview?: string | null;
  adminMinutesEst?: number;
  /** Failed import queue items — must never be ignored in calm copy */
  importFailed?: number;
  ordersNeedAttention?: number;
  failedPay?: number;
  failedEmail?: number;
};

export type ColleagueBrief = {
  greeting: string;
  intro: string;
  did: string[];
  found: string[];
  recommends: string[];
  needsHelp: string[];
  closing: string;
  estimatedMinutes: number;
  actions: DeskAction[];
  storyParagraphs: string[];
};

function greetingForHour(hour: number, name: string): string {
  if (hour < 5) return `Hei ${name} — nattevakt fortsatt på.`;
  if (hour < 12) return `God morgen ${name}.`;
  if (hour < 18) return `Hei ${name}.`;
  return `God kveld ${name}.`;
}

function fmt(n: number): string {
  return Math.max(0, Math.round(n || 0)).toLocaleString("no-NO");
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildColleagueBrief(
  input: ColleagueBriefInput | null | undefined
): ColleagueBrief {
  const src = input || {};
  const hour = src.hour ?? new Date().getHours();
  const name = (src.adminName || "Robin").trim() || "Robin";
  const greeting = greetingForHour(hour, name);

  const did: string[] = [];
  const found: string[] = [];
  const recommends: string[] = [];

  const s =
    src.autonomySummary && typeof src.autonomySummary === "object"
      ? src.autonomySummary
      : {};
  const bm =
    src.buyerMission && typeof src.buyerMission === "object"
      ? src.buyerMission
      : null;
  const analyzed = safeNum(bm?.analyzed) || safeNum(s.productsAnalyzed);
  const discarded = safeNum(bm?.discarded);
  const candidates =
    safeNum(bm?.candidates) ||
    safeNum(s.newCandidatesFound) ||
    safeNum(s.fittedProfile);
  const imported = safeNum(bm?.imported) || safeNum(s.imported);
  const qg = safeNum(bm?.passedQualityGate) || safeNum(s.passedQualityGate);
  const readyFromMission = safeNum(bm?.readyToPublish);
  const merch = safeNum(src.merchSuggested);
  const buyer = safeNum(src.buyerRanked);
  const ready = readyFromMission || safeNum(src.readyToPublish);
  const improve = safeNum(src.improvePending);
  const pricePending = safeNum(src.priceChangePending);
  const orders = safeNum(src.paidNewOrders);
  const est = Math.max(1, safeNum(src.adminMinutesEst) || 15);
  const importFailed = safeNum(src.importFailed);

  const attention = deskAttentionFromQueues({
    importFailed,
    paidNew: orders,
    improvePending: improve,
    priceChangePending: pricePending,
    readyToPublish: ready,
    catalogIssuesHigh: src.catalogIssuesHigh,
    performanceProblems: src.performanceProblems,
    ordersNeedAttention: src.ordersNeedAttention,
    failedPay: src.failedPay,
    failedEmail: src.failedEmail,
  });

  did.push("Jeg jobbet i natt.");
  if (analyzed > 0) {
    did.push(
      `Jeg analyserte ${fmt(analyzed)} produkter${hour < 12 ? " i natt" : ""}.`
    );
  } else if (src.morningBrief) {
    did.push("Jeg gikk gjennom butikken og skrev en brief til deg.");
  } else {
    did.push("Jeg holdt vakt — lite nytt å analysere ennå.");
  }
  if (discarded > 0) did.push(`Jeg forkastet ${fmt(discarded)}.`);
  if (candidates > 0) did.push(`Jeg fant ${fmt(candidates)} kandidater.`);
  if (qg > 0) did.push(`${fmt(qg)} bestod Quality Gate.`);
  if (readyFromMission > 0) {
    did.push(`${fmt(readyFromMission)} ligger klare til godkjenning.`);
  } else if (imported > 0) {
    did.push(`Importerte ${fmt(imported)} produkter.`);
  }

  if (candidates > 0 && !did.some((l) => l.includes("kandidater"))) {
    found.push(`Fant ${fmt(candidates)} kandidater.`);
  }
  if (buyer > 0)
    found.push(`${fmt(buyer)} rangerte produkter klare i Digital Buyer.`);
  if (merch > 0) found.push(`${fmt(merch)} Merchandiser-forslag venter.`);
  if (importFailed > 0) {
    found.push(`${fmt(importFailed)} importer feilet og ligger i kø.`);
  }
  if (!found.length && candidates === 0) {
    found.push(
      attention.hasCriticalAttention
        ? "Det er åpne saker som trenger deg — se nedenfor."
        : "Ingen nye store funn å rapportere akkurat nå."
    );
  } else if (!found.length) {
    found.push("Katalogbygging er i gang — se Digital Buyer for detaljer.");
  }

  if (improve > 0)
    recommends.push(`Godkjenn ${fmt(improve)} forslag før de går live.`);
  if (ready > 0) recommends.push(`Publiser ${fmt(ready)} som allerede er klar.`);
  if (orders > 0) recommends.push(`Behandle ${fmt(orders)} betalte ordre.`);
  if (importFailed > 0) {
    recommends.push(`Rydd ${fmt(importFailed)} feilede importer.`);
  }
  if (!recommends.length) {
    recommends.push(
      attention.hasCriticalAttention
        ? "Prioriter de røde sakene først."
        : "Katalog og kø er rolige — du kan fokusere på strategi."
    );
  }

  const needsHelp =
    attention.needsHelp.length > 0
      ? attention.needsHelp
      : ["Ingen kritiske problemer."];

  const actions: DeskAction[] = [...attention.actions];
  if (buyer > 0 && !actions.some((a) => a.id === "buyer")) {
    actions.push({
      id: "buyer",
      label: `Se ${buyer} innkjøpskandidater`,
      href: "#desk-buyer",
      urgency: "green",
      count: buyer,
    });
  }

  const closing =
    est <= 20
      ? `Estimert arbeidstid: ${est} minutter.`
      : `Estimert arbeidstid: ca. ${est} minutter — si ifra hvis noe kan automatiseres.`;

  return {
    greeting,
    intro: "Jeg har allerede jobbet mens du sov.",
    did,
    found,
    recommends,
    needsHelp,
    closing,
    estimatedMinutes: est,
    actions,
    storyParagraphs: [
      greeting,
      "",
      ...did,
      "",
      ...found.slice(0, 3),
      "",
      needsHelp[0],
    ],
  };
}
