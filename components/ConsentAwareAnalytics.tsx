"use client";

import { useEffect, useState } from "react";
import { MarketingTags } from "@/components/analytics/MarketingTags";
import { AnalyticsRouter } from "@/components/analytics/AnalyticsRouter";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";
import { hasAnyClientAnalytics } from "@/lib/analytics/config";

/**
 * Mount marketing tags only after explicit "all" cookie consent.
 */
export function ConsentAwareAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    try {
      setAllowed(localStorage.getItem(CONSENT_STORAGE_KEY) === "all");
    } catch {
      setAllowed(false);
    }
  }, []);

  if (!allowed || !hasAnyClientAnalytics()) return null;

  return (
    <>
      <MarketingTags />
      <AnalyticsRouter />
    </>
  );
}
