/**
 * Locale normalization for ElectroHypeX storefront.
 * Turns supplier English / shorthand into clean Norwegian labels.
 */

const COLOR_MAP: Array<{ pattern: RegExp; no: string }> = [
  { pattern: /^cool\s*black$/i, no: "Sort" },
  { pattern: /^jet\s*black$/i, no: "Sort" },
  { pattern: /^matte?\s*black$/i, no: "Sort" },
  { pattern: /^black$/i, no: "Sort" },
  { pattern: /^svart$/i, no: "Sort" },
  { pattern: /^grey$/i, no: "Grå" },
  { pattern: /^gray$/i, no: "Grå" },
  { pattern: /^grå$/i, no: "Grå" },
  { pattern: /^space\s*gr[ae]y$/i, no: "Spacegrå" },
  { pattern: /^white$/i, no: "Hvit" },
  { pattern: /^hvit$/i, no: "Hvit" },
  { pattern: /^red$/i, no: "Rød" },
  { pattern: /^rød$/i, no: "Rød" },
  { pattern: /^blue$/i, no: "Blå" },
  { pattern: /^blå$/i, no: "Blå" },
  { pattern: /^navy$/i, no: "Marineblå" },
  { pattern: /^green$/i, no: "Grønn" },
  { pattern: /^grønn$/i, no: "Grønn" },
  { pattern: /^yellow$/i, no: "Gul" },
  { pattern: /^pink$/i, no: "Rosa" },
  { pattern: /^rosa$/i, no: "Rosa" },
  { pattern: /^purple$/i, no: "Lilla" },
  { pattern: /^orange$/i, no: "Oransje" },
  { pattern: /^brown$/i, no: "Brun" },
  { pattern: /^gold$/i, no: "Gull" },
  { pattern: /^silver$/i, no: "Sølv" },
  { pattern: /^clear$/i, no: "Gjennomsiktig" },
  { pattern: /^transparent$/i, no: "Gjennomsiktig" },
  { pattern: /^beige$/i, no: "Beige" },
];

/** Phone / device model shorthand → storefront Norwegian */
const MODEL_MAP: Array<{ pattern: RegExp; no: string }> = [
  { pattern: /^apple\s*13$/i, no: "iPhone 13" },
  { pattern: /^apple\s*14$/i, no: "iPhone 14" },
  { pattern: /^apple\s*15$/i, no: "iPhone 15" },
  { pattern: /^apple\s*16$/i, no: "iPhone 16" },
  { pattern: /^13\s*pro\s*max$/i, no: "iPhone 13 Pro Max" },
  { pattern: /^13promax$/i, no: "iPhone 13 Pro Max" },
  { pattern: /^13\s*pro$/i, no: "iPhone 13 Pro" },
  { pattern: /^13pro$/i, no: "iPhone 13 Pro" },
  { pattern: /^13\s*mini$/i, no: "iPhone 13 mini" },
  { pattern: /^14\s*pro\s*max$/i, no: "iPhone 14 Pro Max" },
  { pattern: /^14promax$/i, no: "iPhone 14 Pro Max" },
  { pattern: /^14\s*pro$/i, no: "iPhone 14 Pro" },
  { pattern: /^14pro$/i, no: "iPhone 14 Pro" },
  { pattern: /^15\s*pro\s*max$/i, no: "iPhone 15 Pro Max" },
  { pattern: /^15promax$/i, no: "iPhone 15 Pro Max" },
  { pattern: /^15\s*pro$/i, no: "iPhone 15 Pro" },
  { pattern: /^15pro$/i, no: "iPhone 15 Pro" },
  { pattern: /^16\s*pro\s*max$/i, no: "iPhone 16 Pro Max" },
  { pattern: /^16promax$/i, no: "iPhone 16 Pro Max" },
  { pattern: /^16\s*pro$/i, no: "iPhone 16 Pro" },
  { pattern: /^16pro$/i, no: "iPhone 16 Pro" },
  { pattern: /^iphone\s*(\d+)\s*pro\s*max$/i, no: "iPhone $1 Pro Max" },
  { pattern: /^iphone\s*(\d+)\s*pro$/i, no: "iPhone $1 Pro" },
  { pattern: /^iphone\s*(\d+)$/i, no: "iPhone $1" },
  { pattern: /^samsung\s*s(\d+)/i, no: "Samsung Galaxy S$1" },
  { pattern: /^galaxy\s*s(\d+)/i, no: "Samsung Galaxy S$1" },
];

export function normalizeColorLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  for (const { pattern, no } of COLOR_MAP) {
    if (pattern.test(t)) return no;
  }
  // Title-case leftover English single words lightly
  if (/^[a-z]+$/i.test(t) && t.length <= 12) {
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  return t;
}

export function normalizeModelLabel(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return t;
  for (const { pattern, no } of MODEL_MAP) {
    if (pattern.test(t)) {
      return t.replace(pattern, no);
    }
  }
  // "13 Pro" without iPhone prefix
  if (/^\d{2}\s*pro(\s*max)?$/i.test(t)) {
    return normalizeModelLabel(`iphone ${t}`);
  }
  return t;
}

/**
 * Normalize any variant attribute value for customer display.
 */
export function normalizeVariantValue(raw: string, attrKey?: string): string {
  const key = (attrKey || "").toLowerCase();
  if (/color|colour|farge/.test(key)) return normalizeColorLabel(raw);
  if (/model|modell|device|compatibility|kompat/.test(key)) {
    return normalizeModelLabel(raw);
  }
  // Heuristic when key unknown
  if (COLOR_MAP.some((c) => c.pattern.test(raw.trim()))) {
    return normalizeColorLabel(raw);
  }
  if (
    /^(apple|iphone|\d{2}\s*pro|\d{2}pro)/i.test(raw.trim()) ||
    /promax|galaxy/i.test(raw)
  ) {
    return normalizeModelLabel(raw);
  }
  return raw.trim();
}

export function formatVariantLine(primary: string, secondary?: string): string {
  if (secondary) return `${primary} • ${secondary}`;
  return primary;
}
