/**
 * First-party beacon — same events as GA4/Meta/TikTok, stored for learning.
 */

import { hasMarketingConsent } from "@/lib/consent";
import type { EcommerceEventName } from "@/lib/analytics/ecommerce";

const SESSION_KEY = "ehx_mkt_session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

function utmFromLocation(): {
  source?: string;
  medium?: string;
  campaign?: string;
} {
  if (typeof window === "undefined") return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    return {
      source: sp.get("utm_source") || undefined,
      medium: sp.get("utm_medium") || undefined,
      campaign: sp.get("utm_campaign") || undefined,
    };
  } catch {
    return {};
  }
}

export function beaconMarketingEvent(input: {
  event: EcommerceEventName | string;
  path?: string;
  productId?: string;
  productName?: string;
  transactionId?: string;
  value?: number;
  currency?: string;
  items?: Array<{ item_id?: string; item_name?: string }>;
  meta?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;
  if (!hasMarketingConsent()) return;

  const utm = utmFromLocation();
  const productId =
    input.productId || input.items?.[0]?.item_id || undefined;
  const productName =
    input.productName || input.items?.[0]?.item_name || undefined;

  const body = {
    event: input.event,
    sessionId: getSessionId(),
    path: input.path || window.location.pathname,
    productId,
    productName,
    transactionId: input.transactionId,
    value: input.value,
    currency: input.currency || "NOK",
    source: utm.source,
    medium: utm.medium,
    campaign: utm.campaign,
    meta: input.meta,
  };

  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([json], { type: "application/json" });
      navigator.sendBeacon("/api/marketing/events", blob);
      return;
    }
  } catch {
    /* fall through */
  }

  fetch("/api/marketing/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {});
}
