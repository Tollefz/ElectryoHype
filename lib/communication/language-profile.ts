/**
 * Language profiles — display metadata for a locale.
 * Not Norwegian-specific: any store can register profiles.
 */

export type LocaleCode = string;

export type LanguageProfile = {
  /** BCP 47, e.g. nb-NO, en-US, de-DE */
  locale: LocaleCode;
  /** ISO 639-1 primary language subtag */
  language: string;
  /** Human label in that language (or English fallback) */
  displayName: string;
  /** English label for admin tooling */
  displayNameEn: string;
  direction: "ltr" | "rtl";
  /** Intl date/number locale */
  dateLocale: string;
  currencyFallback?: string;
};

const BUILTIN: Record<string, LanguageProfile> = {
  "nb-NO": {
    locale: "nb-NO",
    language: "nb",
    displayName: "Norsk",
    displayNameEn: "Norwegian",
    direction: "ltr",
    dateLocale: "nb-NO",
    currencyFallback: "NOK",
  },
  "en-US": {
    locale: "en-US",
    language: "en",
    displayName: "English",
    displayNameEn: "English",
    direction: "ltr",
    dateLocale: "en-US",
    currencyFallback: "USD",
  },
  "en-GB": {
    locale: "en-GB",
    language: "en",
    displayName: "English (UK)",
    displayNameEn: "English (UK)",
    direction: "ltr",
    dateLocale: "en-GB",
    currencyFallback: "GBP",
  },
  "de-DE": {
    locale: "de-DE",
    language: "de",
    displayName: "Deutsch",
    displayNameEn: "German",
    direction: "ltr",
    dateLocale: "de-DE",
    currencyFallback: "EUR",
  },
  "sv-SE": {
    locale: "sv-SE",
    language: "sv",
    displayName: "Svenska",
    displayNameEn: "Swedish",
    direction: "ltr",
    dateLocale: "sv-SE",
    currencyFallback: "SEK",
  },
  "da-DK": {
    locale: "da-DK",
    language: "da",
    displayName: "Dansk",
    displayNameEn: "Danish",
    direction: "ltr",
    dateLocale: "da-DK",
    currencyFallback: "DKK",
  },
};

const customProfiles = new Map<string, LanguageProfile>();

/** Register or override a language profile (e.g. for a new market). */
export function registerLanguageProfile(profile: LanguageProfile): void {
  const key = profile.locale.trim();
  if (!key) return;
  customProfiles.set(key, { ...profile, locale: key });
}

export function getLanguageProfile(
  locale: LocaleCode | null | undefined
): LanguageProfile {
  const key = String(locale || "").trim();
  if (key && customProfiles.has(key)) return customProfiles.get(key)!;
  if (key && BUILTIN[key]) return BUILTIN[key];

  // language-only fallback: nb → nb-NO
  const lang = key.split("-")[0]?.toLowerCase();
  if (lang) {
    const hit =
      [...customProfiles.values(), ...Object.values(BUILTIN)].find(
        (p) => p.language === lang
      ) || null;
    if (hit) return hit;
  }

  return BUILTIN["en-US"];
}

export function listLanguageProfiles(): LanguageProfile[] {
  const map = new Map<string, LanguageProfile>();
  for (const p of Object.values(BUILTIN)) map.set(p.locale, p);
  for (const p of customProfiles.values()) map.set(p.locale, p);
  return [...map.values()];
}

export function resetLanguageProfilesForTests(): void {
  customProfiles.clear();
}
