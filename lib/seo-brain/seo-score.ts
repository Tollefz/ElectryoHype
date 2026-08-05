/**
 * SEO page/product scoring — facts only, never auto-writes content.
 */

export type SeoIssueCode =
  | "missing_meta_title"
  | "missing_meta_description"
  | "short_meta_title"
  | "long_meta_title"
  | "short_meta_description"
  | "long_meta_description"
  | "missing_description"
  | "short_description"
  | "duplicate_meta_title"
  | "missing_images"
  | "missing_alt_capability"
  | "missing_faq"
  | "missing_category"
  | "weak_schema"
  | "slug_risk";

export type SeoIssue = {
  code: SeoIssueCode;
  severity: "warning" | "opportunity" | "critical";
  message: string;
  why: string;
};

export type SeoProductScoreInput = {
  id: string;
  name: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  description: string | null;
  shortDescription: string | null;
  images: string;
  category: string | null;
  price: number;
  isActive: boolean;
  /** Set when another product shares the same metaTitle */
  duplicateMetaTitle?: boolean;
};

export type SeoProductScoreResult = {
  productId: string;
  name: string;
  slug: string;
  path: string;
  score: number;
  issues: SeoIssue[];
  indexingLikely: boolean;
};

function parseImages(raw: string): string[] {
  try {
    const p = JSON.parse(raw || "[]");
    return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
  } catch {
    return raw?.trim() ? [raw] : [];
  }
}

function plainLen(html: string | null | undefined): number {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function hasFaqSignal(description: string | null, short: string | null): boolean {
  const blob = `${description || ""}\n${short || ""}`.toLowerCase();
  return /faq|ofte stilte|spørsmål og svar|spørsmål:|q&a/i.test(blob);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Score one product PDP for SEO readiness (0–100).
 */
export function scoreProductSeo(
  input: SeoProductScoreInput
): SeoProductScoreResult {
  const issues: SeoIssue[] = [];
  let score = 100;

  const metaTitle = (input.metaTitle || "").trim();
  const metaDesc = (input.metaDescription || "").trim();
  const bodyLen = plainLen(input.description) + plainLen(input.shortDescription);
  const imgs = parseImages(input.images);

  if (!metaTitle) {
    issues.push({
      code: "missing_meta_title",
      severity: "critical",
      message: "Mangler meta title",
      why: "Uten metaTitle bruker søkemotorer tilfeldig tekst — dårlig CTR i SERP.",
    });
    score -= 20;
  } else if (metaTitle.length < 10) {
    issues.push({
      code: "short_meta_title",
      severity: "warning",
      message: `Meta title for kort (${metaTitle.length} tegn)`,
      why: "Under ~10–30 tegn gir lite kontekst i søkeresultater.",
    });
    score -= 8;
  } else if (metaTitle.length > 60) {
    issues.push({
      code: "long_meta_title",
      severity: "opportunity",
      message: `Meta title kan bli kuttet (${metaTitle.length} tegn)`,
      why: "Google viser typisk ~50–60 tegn; resten truncates.",
    });
    score -= 4;
  }

  if (!metaDesc) {
    issues.push({
      code: "missing_meta_description",
      severity: "critical",
      message: "Mangler meta description",
      why: "Uten metaDescription mister du kontroll på snippet under tittelen.",
    });
    score -= 18;
  } else if (metaDesc.length < 30) {
    issues.push({
      code: "short_meta_description",
      severity: "warning",
      message: `Meta description for kort (${metaDesc.length} tegn)`,
      why: "Korte snippets konverterer dårlig i søkeresultater.",
    });
    score -= 6;
  } else if (metaDesc.length > 160) {
    issues.push({
      code: "long_meta_description",
      severity: "opportunity",
      message: `Meta description lang (${metaDesc.length} tegn)`,
      why: "Over ~155–160 tegn kuttes ofte i SERP.",
    });
    score -= 3;
  }

  if (input.duplicateMetaTitle && metaTitle) {
    issues.push({
      code: "duplicate_meta_title",
      severity: "warning",
      message: "Duplikat meta title",
      why: "Flere produkter deler samme title — søkemotorer kan velge feil side eller splitte signal.",
    });
    score -= 12;
  }

  if (bodyLen === 0) {
    issues.push({
      code: "missing_description",
      severity: "critical",
      message: "Mangler produktbeskrivelse",
      why: "Ingen body-tekst å indeksere utover tittel — svakt ranking-grunnlag.",
    });
    score -= 15;
  } else if (bodyLen < 80) {
    issues.push({
      code: "short_description",
      severity: "warning",
      message: `Kort beskrivelse (${bodyLen} tegn)`,
      why: "Tynn innholdsside gir lite relevanssignal og dårligere konvertering.",
    });
    score -= 8;
  }

  if (imgs.length === 0) {
    issues.push({
      code: "missing_images",
      severity: "critical",
      message: "Mangler bilder",
      why: "Ingen bilde for OG/Product schema image — svekker både SEO og CTR.",
    });
    score -= 15;
  } else {
    // Alt text is generated at render time from product name — flag as opportunity
    issues.push({
      code: "missing_alt_capability",
      severity: "opportunity",
      message: "Ingen lagret alt-tekst per bilde",
      why: "Alt settes runtime fra produktnavn. Dedikert alt per bilde kan forbedre tilgjengelighet og bilde-søk.",
    });
    score -= 2;
  }

  if (!hasFaqSignal(input.description, input.shortDescription)) {
    issues.push({
      code: "missing_faq",
      severity: "opportunity",
      message: "Mangler FAQ-seksjon",
      why: "FAQ kan gi long-tail søkeord og rich-result potensial (når merket korrekt).",
    });
    score -= 5;
  }

  if (
    !input.category ||
    !input.category.trim() ||
    input.category === "Ukategorisert"
  ) {
    issues.push({
      code: "missing_category",
      severity: "warning",
      message: "Mangler kategori",
      why: "Uten kategori svekkes intern linking via kategori-lister og breadcrumb-signal.",
    });
    score -= 10;
  }

  if (!input.slug || input.slug.length < 3) {
    issues.push({
      code: "slug_risk",
      severity: "critical",
      message: "Ugyldig / manglende slug",
      why: "Canonical og sitemap krever stabil slug — ellers 404-risiko.",
    });
    score -= 20;
  }

  const schemaReady =
    Boolean(input.name) &&
    input.price > 0 &&
    imgs.length > 0 &&
    Boolean(input.slug);
  if (!schemaReady) {
    issues.push({
      code: "weak_schema",
      severity: "warning",
      message: "Svakt grunnlag for Product schema",
      why: "JSON-LD Product trenger navn, pris og bilde for å være nyttig.",
    });
    score -= 8;
  }

  const indexingLikely =
    input.isActive &&
    Boolean(input.slug) &&
    imgs.length > 0 &&
    (Boolean(metaTitle) || Boolean(input.name));

  return {
    productId: input.id,
    name: input.name,
    slug: input.slug,
    path: `/products/${input.slug}`,
    score: clamp(score),
    issues,
    indexingLikely,
  };
}

export function aggregateSeoScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return clamp(avg);
}
