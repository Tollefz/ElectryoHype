/**
 * Shared visual primitives for admin order SaaS UI.
 */

import type { ReactNode } from "react";

export function OrderCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title ? (
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "blue" | "green" | "emerald" | "amber" | "violet" | "rose" | "slate";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    blue: "bg-sky-50 text-sky-800 ring-sky-200",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    emerald: "bg-emerald-100 text-emerald-900 ring-emerald-300",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    violet: "bg-violet-50 text-violet-800 ring-violet-200",
    rose: "bg-rose-50 text-rose-800 ring-rose-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Map fulfillment → display label + tone for list badges */
export function fulfillmentBadge(status: string): {
  label: string;
  tone: "blue" | "green" | "emerald" | "amber" | "violet" | "rose" | "slate";
} {
  switch (status) {
    case "NEW":
      return { label: "Nytt", tone: "blue" };
    case "ORDERED_FROM_SUPPLIER":
      return { label: "Behandles", tone: "amber" };
    case "SHIPPED":
      return { label: "Sendt", tone: "violet" };
    case "DELIVERED":
      return { label: "Levert", tone: "emerald" };
    case "CANCELLED":
      return { label: "Kansellert", tone: "rose" };
    default:
      return { label: status || "—", tone: "slate" };
  }
}

export function paymentBadge(status: string): {
  label: string;
  tone: "blue" | "green" | "emerald" | "amber" | "violet" | "rose" | "slate";
} {
  switch (status) {
    case "paid":
      return { label: "Betalt", tone: "green" };
    case "pending":
      return { label: "Ubetalt", tone: "amber" };
    case "failed":
      return { label: "Feilet", tone: "rose" };
    case "refunded":
      return { label: "Refundert", tone: "slate" };
    default:
      return { label: status || "—", tone: "slate" };
  }
}

export const ORDER_STATUS_STEPS = [
  "Ny",
  "Bekreftet",
  "Behandles",
  "Bestilt hos CJ",
  "Sendt fra CJ",
  "På vei",
  "Levert",
] as const;

/** Active step index 0..6 from fulfillment + payment */
export function orderProgressIndex(
  fulfillment: string,
  payment: string
): number {
  if (fulfillment === "DELIVERED") return 6;
  if (fulfillment === "SHIPPED") return 5;
  if (fulfillment === "ORDERED_FROM_SUPPLIER") return 3;
  if (fulfillment === "CANCELLED") return 0;
  if (fulfillment === "NEW" && payment === "paid") return 1;
  return 0;
}

export function countryFromShipping(raw: unknown): string {
  try {
    const o =
      typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : {};
    const c = String(o.country || o.countryCode || "").trim();
    if (!c) return "—";
    if (/^no$/i.test(c) || /norge/i.test(c)) return "Norge";
    return c;
  } catch {
    return "—";
  }
}
