/**
 * Build short, distinctive Norwegian labels for product variants.
 */

import {
  normalizeVariantValue,
  formatVariantLine,
} from "@/lib/products/presentation/normalize-locale";

const ATTR_PRIORITY = [
  "color",
  "colour",
  "farge",
  "model",
  "modell",
  "size",
  "størrelse",
  "capacity",
  "kapasitet",
  "storage",
  "lagring",
  "length",
  "lengde",
  "type",
  "style",
  "stil",
];

export type VariantLike = {
  name: string;
  attributes?: Record<string, string> | null;
};

function stripProductName(variantName: string, productName: string): string {
  let label = variantName.trim();
  const product = productName.trim();
  if (!product) return label;

  const re = new RegExp(
    product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
    "ig"
  );
  label = label.replace(re, " ").trim();
  label = label.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, "").trim();
  label = label.replace(/\s{2,}/g, " ");

  if (label.length > 48) {
    const parts = label.split(/\s[-–—|]\s/);
    if (parts.length > 1) label = parts[parts.length - 1].trim();
  }
  return label;
}

function differingAttributeKeys(variants: VariantLike[]): string[] {
  const keyValues = new Map<string, Set<string>>();
  for (const v of variants) {
    const attrs = v.attributes || {};
    for (const [k, val] of Object.entries(attrs)) {
      if (!val || typeof val !== "string") continue;
      const nk = k.toLowerCase();
      if (/warehouse|sku|id|vid|barcode|weight|price/i.test(nk)) continue;
      if (!keyValues.has(nk)) keyValues.set(nk, new Set());
      keyValues.get(nk)!.add(val.trim().toLowerCase());
    }
  }
  const differing = [...keyValues.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([k]) => k);

  differing.sort((a, b) => {
    const ia = ATTR_PRIORITY.indexOf(a);
    const ib = ATTR_PRIORITY.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return differing;
}

function attrValue(variant: VariantLike, key: string): string | null {
  const attrs = variant.attributes || {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k.toLowerCase() === key && v) return String(v).trim();
  }
  return null;
}

export type VariantDisplayLabel = {
  primary: string;
  secondary?: string;
  /** Combined line: "Grå • iPhone 13 Pro" */
  line: string;
};

export function getVariantDisplayLabel(
  variant: VariantLike,
  productName: string,
  allVariants: VariantLike[]
): VariantDisplayLabel {
  const keys = differingAttributeKeys(allVariants);
  const values = keys
    .map((k) => {
      const raw = attrValue(variant, k);
      return raw ? normalizeVariantValue(raw, k) : null;
    })
    .filter((v): v is string => Boolean(v));

  if (values.length >= 2) {
    return {
      primary: values[0],
      secondary: values.slice(1).join(" • "),
      line: formatVariantLine(values[0], values.slice(1).join(" • ")),
    };
  }
  if (values.length === 1) {
    return { primary: values[0], line: values[0] };
  }

  const stripped = stripProductName(variant.name, productName);
  if (stripped && stripped.toLowerCase() !== productName.toLowerCase()) {
    const slash = stripped.split(/\s*\/\s*/);
    if (slash.length >= 2) {
      const primary = normalizeVariantValue(slash[slash.length - 1]);
      const secondary = normalizeVariantValue(slash[0]);
      return {
        primary,
        secondary,
        line: formatVariantLine(primary, secondary),
      };
    }
    // "Grey 13pro" style
    const parts = stripped.split(/\s+/);
    if (parts.length >= 2) {
      const maybeColor = normalizeVariantValue(parts[0], "color");
      const maybeModel = normalizeVariantValue(parts.slice(1).join(" "), "model");
      if (maybeColor !== parts[0] || /iphone|samsung|galaxy/i.test(maybeModel)) {
        return {
          primary: maybeColor,
          secondary: maybeModel,
          line: formatVariantLine(maybeColor, maybeModel),
        };
      }
    }
    const primary = normalizeVariantValue(stripped);
    return {
      primary: primary.length > 40 ? primary.slice(0, 37) + "…" : primary,
      line: primary.length > 40 ? primary.slice(0, 37) + "…" : primary,
    };
  }

  const fallback = variant.name.split(/\s[-–—|]\s/).pop()?.trim() || variant.name;
  const primary = normalizeVariantValue(fallback);
  return {
    primary: primary.length > 40 ? primary.slice(0, 37) + "…" : primary,
    line: primary.length > 40 ? primary.slice(0, 37) + "…" : primary,
  };
}

export function getVariantTypeLabel(allVariants: VariantLike[]): string {
  const keys = differingAttributeKeys(allVariants);
  if (keys.length === 0) return "Variant";
  const first = keys[0];
  const map: Record<string, string> = {
    color: "Farge",
    colour: "Farge",
    farge: "Farge",
    model: "Modell",
    modell: "Modell",
    size: "Størrelse",
    størrelse: "Størrelse",
    capacity: "Kapasitet",
    kapasitet: "Kapasitet",
    storage: "Lagring",
    lagring: "Lagring",
    length: "Lengde",
    lengde: "Lengde",
  };
  return map[first] || "Variant";
}
