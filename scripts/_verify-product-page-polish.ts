/**
 * Quick verification for product page polish helpers.
 * Run: npx tsx scripts/_verify-product-page-polish.ts
 */
import { toCustomerSpecs } from "../lib/products/customer-specs";
import {
  buildStorefrontDescription,
  isGenericDescription,
} from "../lib/products/storefront-description";
import { getVariantDisplayLabel } from "../lib/products/variant-label";

const dirtySpecs = {
  Material: "TPU",
  "Material (ZH)": "塑料",
  "Packaging Key": "pk_123",
  "Customs Name": "Phone case",
  "Category ID": "12345",
  "Listed Count": "999",
  Status: "1",
  "Free Shipping Flag": "0",
  "Supplier ID": "sup_9",
  Color: "Black",
  "Weight (g)": "45",
};

const cleaned = toCustomerSpecs(dirtySpecs);
console.log("Specs kept:", cleaned.map((s) => s.key).join(", "));
const blocked = ["Material (ZH)", "Packaging Key", "Customs Name", "Category ID", "Listed Count", "Status", "Free Shipping Flag", "Supplier ID"];
for (const b of blocked) {
  if (cleaned.some((s) => s.key === b || s.key.includes("(ZH)"))) {
    throw new Error(`Blocked field leaked: ${b}`);
  }
}
if (!cleaned.some((s) => s.key === "Materiale" || s.key === "Farge" || s.key === "Vekt")) {
  console.warn("Expected Materiale/Farge/Vekt — got", cleaned);
}

const caseCopy = buildStorefrontDescription({
  title: "Breathable Magnetic Suction Gaming Phone Case iPhone 13 Pro",
  category: "Gaming",
  shortDescription: "Et praktisk produkt i kategorien Gaming, tilpasset daglig bruk.",
  description: "Et praktisk produkt i kategorien Gaming, tilpasset daglig bruk.",
  specs: dirtySpecs,
});
console.log("Case short:", caseCopy.shortText);
if (/praktisk produkt|tilpasset daglig bruk/i.test(caseCopy.shortText)) {
  throw new Error("Generic filler still in short description");
}
if (!/beskytter|deksel|magnet/i.test(caseCopy.shortText)) {
  throw new Error("Phone case intro not specific enough: " + caseCopy.shortText);
}

const mouseCopy = buildStorefrontDescription({
  title: "Trådløs gamingmus RGB",
  category: "Gaming",
  shortDescription: "",
  description: "",
  specs: { DPI: "16000" },
});
console.log("Mouse short:", mouseCopy.shortText);
if (!/presisjon|mus/i.test(mouseCopy.shortText)) {
  throw new Error("Mouse intro wrong");
}

const productName = "Breathable Magnetic Suction Gaming Phone Case";
const variants = [
  { name: `${productName} - Black / iPhone 13 Pro`, attributes: { Color: "Black", Model: "iPhone 13 Pro" } },
  { name: `${productName} - Grey / iPhone 13 Pro`, attributes: { Color: "Grey", Model: "iPhone 13 Pro" } },
  { name: `${productName} - Black / iPhone 14`, attributes: { Color: "Black", Model: "iPhone 14" } },
];
for (const v of variants) {
  const label = getVariantDisplayLabel(v, productName, variants);
  console.log("Variant label:", label);
  if (/Breathable|Magnetic Suction/i.test(label.primary)) {
    throw new Error("Variant still shows full product name: " + label.primary);
  }
}

if (!isGenericDescription("Et praktisk produkt i kategorien Gaming, tilpasset daglig bruk.")) {
  throw new Error("Should detect generic");
}

console.log("OK — product page polish helpers verified");
