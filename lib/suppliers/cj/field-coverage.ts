/**
 * Database field coverage report for CJ catalog imports.
 * Generated from live API keys + documented fields — not guesses.
 */
export type SupplierFieldCoverage = {
  field: string;
  storedAs: string;
  status: "mapped" | "partial" | "unmapped" | "intentional_skip";
  notes: string;
};

export const CJ_FIELD_COVERAGE: SupplierFieldCoverage[] = [
  { field: "pid", storedAs: "Product.supplierProductId", status: "mapped", notes: "" },
  { field: "productSku", storedAs: "Product.supplierSku / sku", status: "mapped", notes: "" },
  { field: "productNameEn", storedAs: "Import draft title → AI title", status: "mapped", notes: "" },
  { field: "productImage / productImageSet / bigImage", storedAs: "Product.images", status: "mapped", notes: "All unique http URLs" },
  { field: "description", storedAs: "AI context (rewritten)", status: "mapped", notes: "Source kept in ImportQueue.rawPayload" },
  { field: "sellPrice / variantSellPrice", storedAs: "supplierPrice + pricing", status: "mapped", notes: "" },
  { field: "material* / packing* / entry* / productPro* / weight", storedAs: "Product.supplierSpecs + specs", status: "mapped", notes: "Structured JSON" },
  { field: "productKey* / variantKey", storedAs: "Product.attributes + variant.attributes", status: "mapped", notes: "" },
  { field: "variants.*", storedAs: "ProductVariant", status: "mapped", notes: "incl. vid, sku, stock, dims, barcode, weight" },
  { field: "inventories.totalInventory", storedAs: "Product.stock / variant.stock", status: "mapped", notes: "Not nested stock[].inventory" },
  { field: "productVideo + queryVideosByProductId", storedAs: "Product.videos", status: "mapped", notes: "IDs + resolved URLs when API returns them" },
  { field: "suggestSellPrice", storedAs: "supplierSpecs + mappedDraft", status: "mapped", notes: "" },
  { field: "listedNum / status / supplierName", storedAs: "supplierSpecs", status: "mapped", notes: "" },
  { field: "customizationJson1-4", storedAs: "rawPayload only", status: "partial", notes: "Kept in queue raw; no first-class column" },
  { field: "isTestProduct / sourceFrom / createrTime", storedAs: "rawPayload / supplierSpecs when present", status: "partial", notes: "createrTime not in Product model" },
  { field: "SupplierApiLog per product", storedAs: "N/A", status: "intentional_skip", notes: "Global diagnostics — no product FK; not deleted with product" },
];
