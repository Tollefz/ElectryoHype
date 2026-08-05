/**
 * Locale Engine — resolve customer.locale → BCP 47 → LanguageProfile.
 * All customer-facing communication must go through this.
 */

import {
  getLanguageProfile,
  type LanguageProfile,
  type LocaleCode,
} from "./language-profile";

export type LocaleResolveInput = {
  /** Preferred: Customer.locale (BCP 47 or language tag) */
  customerLocale?: string | null;
  /** Snapshot at checkout / order */
  orderLocale?: string | null;
  /** Store default, e.g. from ShopProfile or env */
  storeDefaultLocale?: string | null;
  /** Accept-Language header (optional) */
  acceptLanguage?: string | null;
  /** Country hint (NO → nb-NO, DE → de-DE, …) — soft signal only */
  countryCode?: string | null;
};

const COUNTRY_DEFAULT: Record<string, LocaleCode> = {
  NO: "nb-NO",
  SJ: "nb-NO",
  SE: "sv-SE",
  DK: "da-DK",
  DE: "de-DE",
  AT: "de-DE",
  CH: "de-DE",
  GB: "en-GB",
  US: "en-US",
  IE: "en-GB",
};

/**
 * Normalize messy locale strings to BCP 47-ish codes.
 * Examples: "no" → "nb-NO", "nb_NO" → "nb-NO", "en" → "en-US"
 */
export function normalizeLocale(raw: string | null | undefined): LocaleCode | null {
  if (!raw || !String(raw).trim()) return null;
  let s = String(raw).trim().replace(/_/g, "-");

  // Legacy / checkout shortcuts
  const lower = s.toLowerCase();
  if (lower === "no" || lower === "nb" || lower === "nor") return "nb-NO";
  if (lower === "en") return "en-US";
  if (lower === "de") return "de-DE";
  if (lower === "sv") return "sv-SE";
  if (lower === "da") return "da-DK";

  const parts = s.split("-").filter(Boolean);
  if (parts.length === 1) {
    const lang = parts[0].toLowerCase();
    if (lang === "nb" || lang === "nn") return "nb-NO";
    if (lang.length === 2) {
      return getLanguageProfile(lang).locale;
    }
  }
  if (parts.length >= 2) {
    const lang = parts[0].toLowerCase();
    const region = parts[1].toUpperCase();
    return `${lang}-${region}`;
  }
  return s;
}

function parseAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  if (!first) return null;
  return first.split(";")[0]?.trim() || null;
}

/**
 * Resolve the locale used for a message.
 * Priority: customer → order → accept-language → country → store default → en-US
 */
export function resolveLocale(input: LocaleResolveInput): LocaleCode {
  const candidates = [
    normalizeLocale(input.customerLocale),
    normalizeLocale(input.orderLocale),
    normalizeLocale(parseAcceptLanguage(input.acceptLanguage)),
    input.countryCode
      ? COUNTRY_DEFAULT[String(input.countryCode).toUpperCase()] || null
      : null,
    normalizeLocale(input.storeDefaultLocale),
  ];
  for (const c of candidates) {
    if (c) return c;
  }
  return "en-US";
}

export function resolveLanguageProfile(
  input: LocaleResolveInput
): LanguageProfile {
  return getLanguageProfile(resolveLocale(input));
}

/**
 * Default store locale from env (COMMUNICATION_DEFAULT_LOCALE) or nb-NO for legacy.
 * Prefer configuring per store later via ShopProfile.
 */
export function getStoreDefaultLocale(): LocaleCode {
  return (
    normalizeLocale(process.env.COMMUNICATION_DEFAULT_LOCALE) ||
    normalizeLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE) ||
    "nb-NO"
  );
}
