"use client";

import { useEffect, useState } from "react";
import { MarketingTags } from "@/components/analytics/MarketingTags";
import { AnalyticsRouter } from "@/components/analytics/AnalyticsRouter";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";
import { hasAnyClientAnalytics } from "@/lib/analytics/config";
import { CONSENT_CHANGED_EVENT } from "@/components/CookieConsentBanner";

/**
 * Mount marketing tags only after explicit "all" cookie consent.
 * Listens for consent changes — no full reload required.
 */
export function ConsentAwareAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        setAllowed(localStorage.getItem(CONSENT_STORAGE_KEY) === "all");
      } catch {
        setAllowed(false);
      }
    };
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, []);

  if (!allowed || !hasAnyClientAnalytics()) return null;

  return (
    <>
      <MarketingTags />
      <AnalyticsRouter />
    </>
  );
}
