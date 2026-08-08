/**
 * Single source of truth for Desk attention — queues that must never be contradicted
 * by calm copy like «Ingen kritiske problemer» / «Tomt skrivebord».
 */

export type DeskAttentionAction = {
  id: string;
  label: string;
  href: string;
  urgency: "green" | "yellow" | "red";
  count: number;
};

export type DeskAttention = {
  needsHelp: string[];
  actions: DeskAttentionAction[];
  /** True when calm/empty desk messaging must be suppressed */
  hasCriticalAttention: boolean;
};

function fmt(n: number): string {
  return Math.max(0, Math.round(n || 0)).toLocaleString("no-NO");
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

/**
 * Build attention from desk queue counts (and related ops signals).
 * Use this before rendering any «all clear» narrative.
 */
export function deskAttentionFromQueues(input: {
  importFailed?: number;
  paidNew?: number;
  improvePending?: number;
  priceChangePending?: number;
  readyToPublish?: number;
  catalogIssuesHigh?: number;
  performanceProblems?: number;
  ordersNeedAttention?: number;
  failedPay?: number;
  failedEmail?: number;
}): DeskAttention {
  const needsHelp: string[] = [];
  const actions: DeskAttentionAction[] = [];

  const importFailed = n(input.importFailed);
  const paidNew = n(input.paidNew);
  const improve = n(input.improvePending);
  const pricePending = n(input.priceChangePending);
  const ready = n(input.readyToPublish);
  const catalogHigh = n(input.catalogIssuesHigh);
  const perf = n(input.performanceProblems);
  const ordersAttn = n(input.ordersNeedAttention);
  const failedPay = n(input.failedPay);
  const failedEmail = n(input.failedEmail);

  if (importFailed > 0) {
    needsHelp.push(
      `${fmt(importFailed)} import${importFailed === 1 ? "" : "er"} feilet — trenger oppfølging.`
    );
    actions.push({
      id: "import-failed",
      label: `Se ${fmt(importFailed)} feilede importer`,
      href: "/admin/suppliers/import-queue?status=failed",
      urgency: "red",
      count: importFailed,
    });
  }

  if (paidNew > 0 || ordersAttn > 0) {
    const c = Math.max(paidNew, ordersAttn);
    needsHelp.push(`${fmt(c)} ordre venter.`);
    actions.push({
      id: "orders",
      label: `Behandle ${fmt(c)} ordre`,
      href: "#orders-today",
      urgency: "red",
      count: c,
    });
  }

  if (failedPay > 0) {
    needsHelp.push(`${fmt(failedPay)} betalingsfeil.`);
  }
  if (failedEmail > 0) {
    needsHelp.push(`${fmt(failedEmail)} e-postfeil.`);
  }

  if (improve > 0) {
    needsHelp.push(`${fmt(improve)} trenger din godkjenning.`);
    actions.push({
      id: "approve-improve",
      label: `Godkjenn ${fmt(improve)} forslag`,
      href: "#ai-approvals",
      urgency: "green",
      count: improve,
    });
  }

  if (pricePending > 0) {
    actions.push({
      id: "approve-price",
      label: `Godkjenn ${fmt(pricePending)} prisendring${pricePending === 1 ? "" : "er"}`,
      href: "#ai-approvals",
      urgency: "green",
      count: pricePending,
    });
  }

  if (ready > 0) {
    actions.push({
      id: "publish",
      label: `Publiser ${fmt(ready)} produkter`,
      href: "#desk-publish",
      urgency: "yellow",
      count: ready,
    });
  }

  if (catalogHigh > 0) {
    needsHelp.push(`${fmt(catalogHigh)} katalogproblemer (høy).`);
  }
  if (perf > 0) {
    needsHelp.push(`${fmt(perf)} tekniske problemer.`);
  }

  return {
    needsHelp,
    actions,
    hasCriticalAttention: needsHelp.length > 0 || actions.some((a) => a.urgency === "red"),
  };
}
