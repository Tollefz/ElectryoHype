/**
 * Verify global Product Presentation Layer.
 * Run: npx tsx scripts/_verify-product-presentation.ts
 */
import { buildProductPresentation } from "../lib/products/presentation";
import {
  normalizeColorLabel,
  normalizeModelLabel,
} from "../lib/products/presentation/normalize-locale";
import { getVariantDisplayLabel } from "../lib/products/variant-label";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(normalizeColorLabel("Grey") === "Grå", "Grey → Grå");
assert(normalizeColorLabel("Cool black") === "Sort", "Cool black → Sort");
assert(normalizeModelLabel("13pro") === "iPhone 13 Pro", "13pro");
assert(normalizeModelLabel("Apple13") === "iPhone 13", "Apple13");
assert(normalizeModelLabel("13promax") === "iPhone 13 Pro Max", "13promax");

const productName = "Breathable Magnetic Suction Gaming Phone Case";
const variants = [
  {
    name: `${productName} - Grey / 13pro`,
    attributes: { Color: "Grey", Model: "13pro" },
  },
  {
    name: `${productName} - Cool black / Apple13`,
    attributes: { Color: "Cool black", Model: "Apple13" },
  },
];

const l1 = getVariantDisplayLabel(variants[0], productName, variants);
const l2 = getVariantDisplayLabel(variants[1], productName, variants);
console.log("Labels:", l1.line, "|", l2.line);
assert(l1.line === "Grå • iPhone 13 Pro", `got ${l1.line}`);
assert(l2.line === "Sort • iPhone 13", `got ${l2.line}`);

const presentation = buildProductPresentation({
  id: "p1",
  slug: "test-case",
  name: productName,
  category: "Gaming",
  price: 399,
  compareAtPrice: 449,
  shortDescription: "Et praktisk produkt i kategorien Gaming, tilpasset daglig bruk.",
  description: "Et praktisk produkt i kategorien Gaming, tilpasset daglig bruk.",
  images: ["https://example.com/a.jpg"],
  specs: {
    Material: "TPU",
    "Packaging Key": "pk",
    "Category ID": "99",
    "Customs Name": "case",
  },
  variants: [
    {
      id: "v1",
      name: "Grey 13pro",
      price: 399,
      attributes: { Color: "Grey", Model: "13pro" },
      stock: 10,
      image: "https://example.com/a.jpg",
    },
    {
      id: "v2",
      name: "Cool black Apple13",
      price: 399,
      attributes: { Color: "Cool black", Model: "Apple13" },
      stock: 10,
      image: "https://example.com/b.jpg",
    },
  ],
});

assert(presentation.variants[0].labelPrimary === "Grå", "v0 primary");
assert(presentation.variants[0].labelSecondary === "iPhone 13 Pro", "v0 secondary");
assert(presentation.trustBadges.length === 3, "3 trust badges");
assert(!presentation.trustBadges.some((b) => b.id === "warranty"), "no warranty spam");
assert(
  !presentation.specs.some((s) => /Packaging Key|Category ID|Customs/i.test(s.key)),
  "no CJ meta"
);
assert(/Fordeler|Bruksområder|Tekniske spesifikasjoner|Levering/.test(presentation.descriptionHtml), "sections");
assert(!/praktisk produkt/i.test(presentation.shortIntro), "no filler intro");
assert(presentation.media.images.length >= 1, "gallery works with images");

console.log("OK — global product presentation layer verified");
console.log("  intro:", presentation.shortIntro.slice(0, 80));
console.log("  variant:", presentation.variants.map((v) => `${v.labelPrimary} • ${v.labelSecondary}`).join(" | "));
console.log("  badges:", presentation.trustBadges.map((b) => b.title).join(", "));
