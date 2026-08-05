/**
 * Extract prioritized facts from each brain — never invent numbers or stories.
 */

import type { DigitalBuyerDeskStatus } from "@/lib/buyer/desk-status";
import type { MarketingDeskStatus } from "@/lib/marketing/desk-status";
import type { OrderBrainDeskStatus } from "@/lib/orders/order-desk-status";
import type { FinanceDeskStatus } from "@/lib/finance/finance-desk-status";
import type { CustomerDeskStatus } from "@/lib/customer/customer-desk-status";
import type { SeoDeskStatus } from "@/lib/seo-brain/seo-desk-status";
import type { CeoInsight, CeoPriority } from "./types";

const SOURCE = {
  buyer: "Buyer Brain",
  marketing: "Marketing Brain",
  orders: "Order Brain",
  finance: "Finance Brain",
  seo: "SEO Brain",
  customer: "Customer Brain",
} as const;

function confFromSeverity(
  severity: "info" | "suggest" | "urgent" | string
): number {
  if (severity === "urgent") return 88;
  if (severity === "suggest") return 72;
  if (severity === "info") return 55;
  return 60;
}

function confFromTone(tone: "positive" | "warning" | "neutral" | string): number {
  if (tone === "warning") return 80;
  if (tone === "positive") return 70;
  return 58;
}

function priorityFromSeverity(
  severity: "info" | "suggest" | "urgent" | string
): CeoPriority {
  if (severity === "urgent") return "critical";
  if (severity === "suggest") return "high";
  return "low";
}

export function extractBuyerInsights(
  status: DigitalBuyerDeskStatus | null,
  queueCounts?: { review: number; approved: number }
): CeoInsight[] {
  if (!status) return [];
  const out: CeoInsight[] = [];
  const review = queueCounts?.review ?? 0;
  const approved = queueCounts?.approved ?? 0;

  if (status.apiIssue) {
    out.push({
      id: "buyer-api",
      domain: "buyer",
      priority: "critical",
      headline: "Leverandør-API trenger oppfølging",
      why: status.apiIssue.body || status.apiIssue.title || "API-problem",
      data: `Fase: ${status.phase} · skannet ${status.scanned} · kandidater ${status.candidates}`,
      confidence: 90,
      sourceAi: SOURCE.buyer,
      href: "#desk-buyer",
    });
  }

  if (approved > 0) {
    out.push({
      id: "buyer-publish",
      domain: "buyer",
      priority: "high",
      headline: `${approved} produkt${approved === 1 ? "" : "er"} klare for publisering`,
      why: "Importkøen har godkjente varer som venter på menneskelig publisering.",
      data: `ImportQueue status=approved: ${approved}`,
      confidence: 92,
      sourceAi: SOURCE.buyer,
      href: "#desk-publish",
    });
  } else if (review > 0) {
    out.push({
      id: "buyer-review",
      domain: "buyer",
      priority: "high",
      headline: `${review} produkt${review === 1 ? "" : "er"} venter på gjennomgang`,
      why: "Kvalitetsporten er passert til review — eier må bestemme.",
      data: `ImportQueue status=review: ${review}`,
      confidence: 90,
      sourceAi: SOURCE.buyer,
      href: "#desk-buyer",
    });
  }

  if (status.candidates > 0 && approved === 0 && review === 0) {
    out.push({
      id: "buyer-candidates",
      domain: "buyer",
      priority: "medium",
      headline: `${status.candidates} kandidater i Buyer-pipeline`,
      why: status.nextStep || "Buyer har funnet kandidater.",
      data: `Skannet ${status.scanned} · kandidater ${status.candidates} · importert ${status.imported} · publisert ${status.published}`,
      confidence: 75,
      sourceAi: SOURCE.buyer,
      href: "#desk-buyer",
    });
  }

  if (out.length === 0 && status.scanned > 0) {
    out.push({
      id: "buyer-ok",
      domain: "buyer",
      priority: "low",
      headline: "Buyer kjører uten kritiske køer",
      why: status.nextStep || "Ingen review/approved-kø akkurat nå.",
      data: `Skannet ${status.scanned} · kandidater ${status.candidates} · fase ${status.phase}`,
      confidence: 65,
      sourceAi: SOURCE.buyer,
      href: "#desk-buyer",
    });
  }

  return out;
}

export function extractMarketingInsights(
  status: MarketingDeskStatus | null
): CeoInsight[] {
  if (!status) return [];
  const out: CeoInsight[] = [];
  const brain = status.brain;
  const promote = brain?.recommendPromote?.slice(0, 2) || [];
  const pause = brain?.recommendPause?.slice(0, 2) || [];

  for (const p of promote) {
    out.push({
      id: `mkt-promote-${p.productId}`,
      domain: "marketing",
      priority: "high",
      headline: `Bør annonseres: ${p.name}`,
      why: p.fact,
      data: p.metricLabel
        ? `${p.metricLabel}: ${p.metric ?? "—"} · productId ${p.productId}`
        : `productId ${p.productId}`,
      confidence: 78,
      sourceAi: SOURCE.marketing,
      href: "#desk-marketing",
      productId: p.productId,
    });
  }

  for (const p of pause) {
    out.push({
      id: `mkt-pause-${p.productId}`,
      domain: "marketing",
      priority: "medium",
      headline: `Vurder å pause: ${p.name}`,
      why: p.fact,
      data: p.metricLabel
        ? `${p.metricLabel}: ${p.metric ?? "—"} · productId ${p.productId}`
        : `productId ${p.productId}`,
      confidence: 74,
      sourceAi: SOURCE.marketing,
      href: "#desk-marketing",
      productId: p.productId,
    });
  }

  const urgent = (status.recommendations || []).filter(
    (r) => r.severity === "urgent" || r.severity === "suggest"
  );
  for (const r of urgent.slice(0, 2)) {
    if (out.some((i) => i.headline === r.title)) continue;
    out.push({
      id: `mkt-rec-${r.id}`,
      domain: "marketing",
      priority: priorityFromSeverity(r.severity),
      headline: r.title,
      why: r.rationale,
      data: r.fromMemory
        ? `Anbefaling ${r.id} · memory: ${r.fromMemory}`
        : `Anbefaling ${r.id} · severity ${r.severity}`,
      confidence: confFromSeverity(r.severity),
      sourceAi: SOURCE.marketing,
      href: "#desk-marketing",
    });
  }

  if (out.length === 0 && status.narrative) {
    out.push({
      id: "mkt-narrative",
      domain: "marketing",
      priority: "low",
      headline: "Ingen akutte annonseprioriteringer",
      why: status.narrative,
      data: `Status ${status.status} · innsikter ${status.topInsights?.length ?? 0}`,
      confidence: 55,
      sourceAi: SOURCE.marketing,
      href: "#desk-marketing",
    });
  }

  return out.slice(0, 4);
}

export function extractOrderInsights(
  status: OrderBrainDeskStatus | null
): CeoInsight[] {
  if (!status) return [];
  const out: CeoInsight[] = [];

  const delayed = status.delayed || [];
  const highRisk = status.highRisk || [];
  const attention = status.needsAttention || [];

  if (delayed.length > 0) {
    const sample = delayed
      .slice(0, 3)
      .map((o) => o.orderNumber)
      .join(", ");
    out.push({
      id: "ord-delayed",
      domain: "orders",
      priority: "critical",
      headline: `${delayed.length} ordre trenger oppfølging (forsinket)`,
      why: delayed[0]?.reason || "Forsinkelsesterskel brutt.",
      data: `Forsinkede: ${delayed.length} · eksempler: ${sample}`,
      confidence: 90,
      sourceAi: SOURCE.orders,
      href: "#orders-today",
      orderId: delayed[0]?.orderId,
    });
  }

  if (highRisk.length > 0) {
    out.push({
      id: "ord-risk",
      domain: "orders",
      priority: "critical",
      headline: `${highRisk.length} høyrisiko-ordre`,
      why: highRisk[0]?.reason || "Order Brain flagget høy risiko.",
      data: highRisk
        .slice(0, 3)
        .map((o) => `${o.orderNumber}: ${o.fact}`)
        .join(" · "),
      confidence: 88,
      sourceAi: SOURCE.orders,
      href: "#orders-today",
      orderId: highRisk[0]?.orderId,
    });
  }

  if (attention.length > 0 && delayed.length === 0) {
    out.push({
      id: "ord-attention",
      domain: "orders",
      priority: "high",
      headline: `${attention.length} ordre trenger blikk`,
      why: attention[0]?.reason || "Avvik i oppfyllelsesfase.",
      data: attention
        .slice(0, 3)
        .map((o) => `${o.orderNumber} (${o.phase})`)
        .join(", "),
      confidence: 82,
      sourceAi: SOURCE.orders,
      href: "#orders-today",
    });
  }

  const warnInsights = (status.insights || []).filter(
    (i) => i.tone === "warning" && i.count > 0
  );
  for (const i of warnInsights.slice(0, 1)) {
    if (out.some((x) => x.id.startsWith("ord-"))) break;
    out.push({
      id: `ord-ins-${i.id}`,
      domain: "orders",
      priority: "medium",
      headline: i.title,
      why: i.why,
      data: i.detail,
      confidence: confFromTone(i.tone),
      sourceAi: SOURCE.orders,
      href: "#orders-today",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "ord-ok",
      domain: "orders",
      priority: "low",
      headline: "Ingen kritiske ordreavvik",
      why: status.narrative || "Order Brain ser stabil status.",
      data: `Status ${status.status}`,
      confidence: 60,
      sourceAi: SOURCE.orders,
      href: "#orders-today",
    });
  }

  return out.slice(0, 3);
}

export function extractFinanceInsights(
  status: FinanceDeskStatus | null
): CeoInsight[] {
  if (!status) return [];
  const out: CeoInsight[] = [];

  const loss = (status.insights || []).find((i) => i.kind === "loss_makers");
  if (loss && loss.tone === "warning") {
    out.push({
      id: `fin-${loss.id}`,
      domain: "finance",
      priority: "critical",
      headline: loss.title,
      why: loss.why,
      data: loss.detail,
      confidence: confFromTone(loss.tone),
      sourceAi: SOURCE.finance,
      href: "#desk-finance",
    });
  }

  for (const r of (status.recommendations || []).slice(0, 3)) {
    if (r.id === "no-data") continue;
    out.push({
      id: `fin-rec-${r.id}`,
      domain: "finance",
      priority: priorityFromSeverity(r.severity),
      headline: r.title,
      why: r.rationale,
      data: `Anbefaling ${r.id} · severity ${r.severity} · actionRequired`,
      confidence: confFromSeverity(r.severity),
      sourceAi: SOURCE.finance,
      href: "#desk-finance",
    });
  }

  const winners = (status.insights || []).find((i) => i.kind === "winners");
  if (winners && out.length < 2) {
    out.push({
      id: `fin-${winners.id}`,
      domain: "finance",
      priority: "low",
      headline: winners.title,
      why: winners.why,
      data: winners.detail,
      confidence: confFromTone(winners.tone),
      sourceAi: SOURCE.finance,
      href: "#desk-finance",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "fin-ok",
      domain: "finance",
      priority: "low",
      headline: "Ingen akutte økonomiprioriteringer",
      why: status.narrative || "Finance Brain venter på mer data.",
      data: `Status ${status.status}`,
      confidence: 55,
      sourceAi: SOURCE.finance,
      href: "#desk-finance",
    });
  }

  return out.slice(0, 3);
}

export function extractSeoInsights(status: SeoDeskStatus | null): CeoInsight[] {
  if (!status) return [];
  const out: CeoInsight[] = [];

  if ((status.summary?.criticalCount ?? 0) > 0 || (status.seoScore ?? 100) < 60) {
    out.push({
      id: "seo-score",
      domain: "seo",
      priority: status.seoScore < 50 ? "critical" : "high",
      headline: `SEO-problem: score ${status.seoScore}/100`,
      why: `${status.summary.criticalCount} kritiske · ${status.summary.warningCount} advarsler`,
      data: `Produkter ${status.summary.productCount} · indexing usikker ${status.summary.indexingUnlikely} · mangler meta ${status.summary.missingMeta}`,
      confidence: 85,
      sourceAi: SOURCE.seo,
      href: "#desk-seo",
    });
  }

  const worst = status.worstPages?.[0];
  if (worst) {
    out.push({
      id: "seo-worst",
      domain: "seo",
      priority: "high",
      headline: `Bør forbedres: ${worst.name}`,
      why: worst.why,
      data: `Score ${worst.score} · path ${worst.path}`,
      confidence: 82,
      sourceAi: SOURCE.seo,
      href: "#desk-seo",
    });
  }

  for (const w of (status.warnings || []).slice(0, 1)) {
    out.push({
      id: `seo-warn-${w.path || "0"}`,
      domain: "seo",
      priority: "medium",
      headline: w.message || `SEO-advarsel: ${w.name}`,
      why: w.why || w.message || "SEO Brain advarsel",
      data: w.path
        ? `${w.name} · path ${w.path}`
        : `Advarsler totalt ${status.summary.warningCount}`,
      confidence: 75,
      sourceAi: SOURCE.seo,
      href: "#desk-seo",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "seo-ok",
      domain: "seo",
      priority: "low",
      headline: "Ingen kritiske SEO-problemer",
      why: status.narrative || "SEO Brain ser stabil katalog.",
      data: `SEO Score ${status.seoScore}/100`,
      confidence: 60,
      sourceAi: SOURCE.seo,
      href: "#desk-seo",
    });
  }

  return out.slice(0, 3);
}

export function extractCustomerInsights(
  status: CustomerDeskStatus | null
): CeoInsight[] {
  if (!status) return [];
  const out: CeoInsight[] = [];
  const churn = status.counts?.churnRisk ?? 0;
  const vip = status.counts?.vip ?? 0;

  if (churn > 0) {
    out.push({
      id: "cust-churn",
      domain: "customer",
      priority: "high",
      headline: `${churn} kunder med churn-risiko`,
      why: "Customer Brain flagget lav frekvens / fallende aktivitet — ingen auto-e-post.",
      data: `Churn-risiko ${churn} · scorert totalt ${status.counts.scored}`,
      confidence: 78,
      sourceAi: SOURCE.customer,
      href: "#desk-customer",
    });
  }

  if (vip > 0) {
    out.push({
      id: "cust-vip",
      domain: "customer",
      priority: "medium",
      headline: `${vip} VIP-kunder å ta vare på`,
      why: "Høy LTV / frekvens i Customer-profiler.",
      data: `VIP ${vip} · high LTV ${status.counts.highLtv}`,
      confidence: 72,
      sourceAi: SOURCE.customer,
      href: "#desk-customer",
    });
  }

  const rec = status.recommendations?.[0];
  if (rec) {
    out.push({
      id: `cust-rec-${rec.customerId}`,
      domain: "customer",
      priority: "medium",
      headline: `Anbefaling: ${rec.shouldGet.join(", ") || "kategori"} (ikke auto-send)`,
      why: rec.why,
      data: `Kunde ${rec.email || rec.customerId} · unngå: ${rec.avoid.join(", ") || "—"}`,
      confidence: 70,
      sourceAi: SOURCE.customer,
      href: "#desk-customer",
    });
  }

  const warn = (status.insights || []).find((i) => i.tone === "warning");
  if (warn && out.length < 2) {
    out.push({
      id: `cust-ins-${warn.id}`,
      domain: "customer",
      priority: "medium",
      headline: warn.title,
      why: warn.why,
      data: warn.detail,
      confidence: confFromTone(warn.tone),
      sourceAi: SOURCE.customer,
      href: "#desk-customer",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "cust-ok",
      domain: "customer",
      priority: "low",
      headline: "Ingen kritiske kundeprioriteringer",
      why: status.narrative || "Customer Brain venter på mer historikk.",
      data: `Scorert ${status.counts?.scored ?? 0}`,
      confidence: 55,
      sourceAi: SOURCE.customer,
      href: "#desk-customer",
    });
  }

  return out.slice(0, 3);
}
