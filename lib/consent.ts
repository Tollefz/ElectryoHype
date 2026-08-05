/**
 * First-party consent helpers (GDPR / ePrivacy).
 * Marketing/analytics cookies must not be set until consent === "all".
 */

export const CONSENT_STORAGE_KEY = "ehx_cookie_consent_v1";
export const CONSENT_COOKIE_NAME = "ehx_consent";
export const PENDING_AFFILIATE_KEY = "ehx_pending_affiliate";
export const AFFILIATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type ConsentChoice = "necessary" | "all";

export function readConsentFromStorage(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (v === "necessary" || v === "all") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function hasMarketingConsent(): boolean {
  return readConsentFromStorage() === "all";
}

/** Apply pending affiliate cookie + click only after marketing consent. */
export function applyPendingAffiliateCookie(): void {
  if (typeof window === "undefined" || !hasMarketingConsent()) return;
  try {
    const pending = localStorage.getItem(PENDING_AFFILIATE_KEY);
    if (!pending) return;

    document.cookie = `affiliateCode=${encodeURIComponent(pending)};path=/;max-age=${AFFILIATE_COOKIE_MAX_AGE};samesite=lax`;

    const dedupeKey = `ref-tracked-${pending}`;
    if (!localStorage.getItem(dedupeKey)) {
      localStorage.setItem(dedupeKey, "1");
      fetch("/api/affiliate/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pending,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export function clearAffiliateCookie(): void {
  if (typeof window === "undefined") return;
  document.cookie = "affiliateCode=;path=/;max-age=0;samesite=lax";
}
