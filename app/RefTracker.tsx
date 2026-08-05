"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  AFFILIATE_COOKIE_MAX_AGE,
  PENDING_AFFILIATE_KEY,
  hasMarketingConsent,
} from "@/lib/consent";

function trackAffiliateClick(ref: string) {
  const dedupeKey = `ref-tracked-${ref}`;
  try {
    if (localStorage.getItem(dedupeKey)) return;
    localStorage.setItem(dedupeKey, "1");
  } catch {
    /* still attempt track */
  }

  fetch("/api/affiliate/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: ref,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    }),
  }).catch((err) => console.error("ref track failed", err));
}

function setAffiliateCookie(ref: string) {
  document.cookie = `affiliateCode=${encodeURIComponent(ref)};path=/;max-age=${AFFILIATE_COOKIE_MAX_AGE};samesite=lax`;
}

/**
 * Affiliate ref tracking.
 * Cookie + click beacon are marketing → only after GDPR consent ("all").
 * Pending code kept in localStorage so consent can apply later.
 */
export default function RefTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();
    if (!ref) return;

    try {
      localStorage.setItem(PENDING_AFFILIATE_KEY, ref);
    } catch {
      /* ignore */
    }

    if (!hasMarketingConsent()) return;

    trackAffiliateClick(ref);
    setAffiliateCookie(ref);
  }, [searchParams]);

  return null;
}
