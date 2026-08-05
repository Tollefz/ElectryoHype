import "server-only";

import { cjRequest } from "@/lib/suppliers/cj/api";
import type {
  SupplierInventorySnapshot,
  SupplierProductDetail,
  SupplierProductVariant,
  SupplierVideo,
} from "@/lib/suppliers/provider";

type CjInventoryRow = {
  countryCode?: string;
  totalInventory?: number | string;
  cjInventory?: number | string;
  factoryInventory?: number | string;
  verifiedWarehouse?: number;
  stock?: Array<{
    stockId?: string;
    inventory?: number | string;
    factoryInventory?: number | string;
  }>;
};

type CjVariant = {
  vid?: string;
  pid?: string;
  variantSku?: string;
  variantNameEn?: string;
  variantName?: string;
  variantSellPrice?: number | string;
  variantSugSellPrice?: number | string;
  variantImage?: string;
  variantWeight?: number | string;
  variantKey?: string;
  variantProperty?: string | unknown;
  variantLength?: number | string;
  variantWidth?: number | string;
  variantHeight?: number | string;
  variantVolume?: number | string;
  variantStandard?: string;
  variantUnit?: string;
  barcode?: string;
  barcode2?: string;
  inventoryNum?: number | string;
  inventories?: CjInventoryRow[] | string;
};

type CjProductQuery = {
  pid?: string;
  productNameEn?: string;
  productName?: string;
  productSku?: string;
  bigImage?: string;
  productImage?: string | string[];
  productImageSet?: string[] | string;
  description?: string;
  sellPrice?: number | string;
  suggestSellPrice?: string | number;
  categoryName?: string;
  categoryId?: string;
  deliveryCycle?: string;
  weight?: number | string;
  productWeight?: number | string;
  packingWeight?: number | string;
  variants?: CjVariant[];
  productUrl?: string;
  productVideo?: string[] | string;
  listedNum?: number;
  status?: string;
  entryCode?: string;
  entryName?: string;
  entryNameEn?: string;
  materialName?: string | string[];
  materialNameEn?: string | string[];
  materialNameSet?: string[];
  materialNameEnSet?: string[];
  materialKey?: string | string[];
  materialKeySet?: string[];
  packingName?: string | string[];
  packingNameEn?: string | string[];
  packingNameSet?: string[];
  packingNameEnSet?: string[];
  packingKey?: string | string[];
  packingKeySet?: string[];
  productKey?: string | string[];
  productKeyEn?: string;
  productKeySet?: string[];
  productKeyEnSet?: string[];
  productPro?: string | string[];
  productProEn?: string | string[];
  productProSet?: string[];
  productProEnSet?: string[];
  productType?: string;
  productUnit?: string;
  supplierName?: string;
  supplierId?: string;
  addMarkStatus?: number;
};

type CjVideoRow = {
  id?: string;
  videoId?: string;
  videoName?: string | null;
  videoUrl?: string | null;
  coverURL?: string | null;
  videoType?: number | string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  videoState?: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    // ranges like "3.02-4.70" → take first number
    const m = value.trim().match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {
        /* fall through */
      }
    }
    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

function joinValues(values: string[]): string | null {
  const cleaned = values.map((v) => v.trim()).filter((v) => v && v !== '""');
  if (!cleaned.length) return null;
  return cleaned.join(", ");
}

/**
 * Collect every unique http(s) image URL CJ provides for the product gallery.
 * Parses JSON-string productImage, productImageSet, and bigImage.
 */
export function extractCjImageUrls(raw: CjProductQuery): string[] {
  const out: string[] = [];
  const push = (url: string) => {
    const u = url.trim();
    if (u.startsWith("http")) out.push(u);
  };

  if (raw.bigImage) push(String(raw.bigImage));

  for (const u of asStringArray(raw.productImage)) push(u);
  for (const u of asStringArray(raw.productImageSet)) push(u);

  return Array.from(new Set(out));
}

function parseInventories(raw: CjVariant["inventories"]): CjInventoryRow[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as CjInventoryRow[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

/**
 * CJ inventory truth: prefer inventories[].totalInventory (factory+CJ).
 * Nested stock[].inventory is often 0 even when factory stock is high.
 */
export function sumVariantInventory(v: CjVariant): number | null {
  const inventories = parseInventories(v.inventories);
  if (inventories.length > 0) {
    const total = inventories.reduce((sum, row) => {
      const n =
        toNumber(row.totalInventory) ??
        (toNumber(row.cjInventory) || 0) + (toNumber(row.factoryInventory) || 0);
      return sum + (n || 0);
    }, 0);
    return total;
  }
  const direct = toNumber(v.inventoryNum);
  return direct;
}

function parseVariantAttributes(
  v: CjVariant,
  optionKeys: string[]
): Record<string, string> {
  const attrs: Record<string, string> = {};
  const key = (v.variantKey || "").trim();
  if (key) {
    const parts = key.split("-").map((p) => p.trim()).filter(Boolean);
    if (optionKeys.length > 0 && parts.length === optionKeys.length) {
      optionKeys.forEach((opt, i) => {
        attrs[opt] = parts[i];
      });
    } else if (optionKeys.length === 1) {
      attrs[optionKeys[0]] = key;
    } else {
      attrs.option = key;
    }
  }

  const props = asStringArray(v.variantProperty);
  if (props.length) attrs.property = props.join(", ");
  if (v.variantStandard) attrs.standard = String(v.variantStandard);
  if (v.variantUnit) attrs.unit = String(v.variantUnit);
  if (v.barcode) attrs.barcode = String(v.barcode);
  if (v.barcode2) attrs.barcode2 = String(v.barcode2);

  const length = toNumber(v.variantLength);
  const width = toNumber(v.variantWidth);
  const height = toNumber(v.variantHeight);
  if (length != null) attrs.lengthMm = String(length);
  if (width != null) attrs.widthMm = String(width);
  if (height != null) attrs.heightMm = String(height);
  const volume = toNumber(v.variantVolume);
  if (volume != null) attrs.volumeMm3 = String(volume);

  const warehouses = parseInventories(v.inventories)
    .map((r) => r.countryCode)
    .filter(Boolean);
  if (warehouses.length) attrs.warehouse = Array.from(new Set(warehouses)).join(",");

  return attrs;
}

function mapVariant(v: CjVariant, optionKeys: string[]): SupplierProductVariant {
  const stock = sumVariantInventory(v);
  return {
    id: String(v.vid || v.variantSku || crypto.randomUUID()),
    sku: v.variantSku || null,
    name: v.variantNameEn || v.variantName || v.variantKey || "Variant",
    price: toNumber(v.variantSellPrice) || 0,
    currency: "USD",
    stock,
    imageUrl: v.variantImage || null,
    weightGrams: toNumber(v.variantWeight),
    dimensionsMm: {
      length: toNumber(v.variantLength),
      width: toNumber(v.variantWidth),
      height: toNumber(v.variantHeight),
    },
    volumeMm3: toNumber(v.variantVolume),
    barcode: v.barcode || null,
    barcode2: v.barcode2 || null,
    suggestedRetailPrice: toNumber(v.variantSugSellPrice),
    attributes: parseVariantAttributes(v, optionKeys),
  };
}

function buildSpecifications(raw: CjProductQuery): Record<string, string> {
  const specs: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    if (value == null) return;
    const v = String(value).trim();
    if (!v || v === "null" || v === "undefined") return;
    // Never store Chinese-only or internal supplier keys for storefront
    if (/[\u4e00-\u9fff]/.test(key) && !/[a-zæøå]/i.test(key)) return;
    specs[key] = v;
  };

  // Customer-facing fields only (no ZH, keys, IDs, customs, status flags)
  set(
    "Materiale",
    joinValues(
      asStringArray(raw.materialNameEnSet?.length ? raw.materialNameEnSet : raw.materialNameEn)
    )
  );
  set(
    "Emballasje",
    joinValues(
      asStringArray(raw.packingNameEnSet?.length ? raw.packingNameEnSet : raw.packingNameEn)
    )
  );
  set(
    "Vekt",
    raw.productWeight != null
      ? String(raw.productWeight)
      : raw.weight != null
        ? String(raw.weight)
        : null
  );
  set("Produkttype", raw.productType && String(raw.productType) !== "ORDINARY_PRODUCT" ? String(raw.productType) : null);
  set("Enhet", raw.productUnit ? String(raw.productUnit) : null);
  // Prefer short English category leaf only if readable; skip deep CJ paths
  if (raw.categoryName) {
    const cat = String(raw.categoryName);
    const leaf = cat.includes(">") ? cat.split(">").pop()?.trim() : cat;
    if (leaf && leaf.length < 60 && !/^\d+$/.test(leaf)) {
      set("Kategori", leaf);
    }
  }

  return specs;
}

function buildAttributes(raw: CjProductQuery): Record<string, string> {
  const attrs: Record<string, string> = {};
  const keysEn = asStringArray(raw.productKeyEnSet?.length ? raw.productKeyEnSet : raw.productKeyEn);
  const keysZh = asStringArray(raw.productKeySet?.length ? raw.productKeySet : raw.productKey);

  if (keysEn.length) attrs.optionKeys = keysEn.join(" / ");
  if (keysZh.length) attrs.optionKeysZh = keysZh.join(" / ");

  // Distinct variant option values per key
  const optionKeys = keysEn.length ? keysEn : keysZh.length ? keysZh : ["Option"];
  const valueSets: Record<string, Set<string>> = {};
  for (const key of optionKeys) valueSets[key] = new Set();

  for (const v of raw.variants || []) {
    const mapped = parseVariantAttributes(v, optionKeys);
    for (const key of optionKeys) {
      if (mapped[key]) valueSets[key].add(mapped[key]);
    }
  }
  for (const [key, set] of Object.entries(valueSets)) {
    if (set.size) attrs[key] = Array.from(set).join(", ");
  }

  return attrs;
}

function mapVideoType(type: number | string | null | undefined): string | null {
  if (type == null || type === "") return null;
  const n = Number(type);
  if (n === 0) return "unboxing";
  if (n === 1) return "marketing";
  if (n === 2) return "review";
  return String(type);
}

export function mapCjProductDetail(
  raw: CjProductQuery,
  videos: SupplierVideo[] = []
): SupplierProductDetail {
  const optionKeys = asStringArray(
    raw.productKeyEnSet?.length ? raw.productKeyEnSet : raw.productKeyEn
  );
  const variants = (raw.variants || []).map((v) => mapVariant(v, optionKeys));
  const stock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  const prices = variants.map((v) => v.price).filter((p) => p > 0);
  const price =
    toNumber(raw.sellPrice) ??
    (prices.length ? Math.min(...prices) : 0) ??
    0;

  const sourceImages = extractCjImageUrls(raw);
  const warehouse =
    variants
      .map((v) => v.attributes.warehouse)
      .find((w) => Boolean(w)) || null;

  // Prefer video list from queryVideos; fall back to IDs from productVideo
  let finalVideos = videos;
  if (!finalVideos.length) {
    finalVideos = asStringArray(raw.productVideo).map((id) => ({
      id,
      url: null,
      name: null,
      coverUrl: null,
      type: null,
      durationSec: null,
      width: null,
      height: null,
    }));
  }

  return {
    id: String(raw.pid || ""),
    sku: raw.productSku || null,
    title: raw.productNameEn || raw.productName || raw.productSku || "CJ-produkt",
    description: raw.description || "",
    images: sourceImages,
    sourceImages,
    price: price || 0,
    currency: "USD",
    category: raw.categoryName || null,
    categoryId: raw.categoryId || null,
    stock: variants.length ? stock : null,
    deliveryTime: raw.deliveryCycle || null,
    weightGrams: toNumber(raw.productWeight) ?? toNumber(raw.weight) ?? variants[0]?.weightGrams ?? null,
    weightRaw: raw.productWeight != null ? String(raw.productWeight) : null,
    packingWeightRaw: raw.packingWeight != null ? String(raw.packingWeight) : null,
    warehouse,
    variants,
    specifications: buildSpecifications(raw),
    attributes: buildAttributes(raw),
    videos: finalVideos,
    supplierUrl: raw.productUrl || (raw.pid ? `https://cjdropshipping.com/product/${raw.pid}` : null),
    shippingEstimate: null,
    listedCount: typeof raw.listedNum === "number" ? raw.listedNum : null,
    suggestSellPriceRaw: raw.suggestSellPrice != null ? String(raw.suggestSellPrice) : null,
    status: raw.status != null ? String(raw.status) : null,
    raw,
  };
}

async function fetchCjVideos(productId: string): Promise<SupplierVideo[]> {
  try {
    const data = await cjRequest<CjVideoRow[] | { list?: CjVideoRow[] }>({
      operation: "product.queryVideosByProductId",
      method: "POST",
      path: "/product/queryVideosByProductId",
      body: { productId },
      cacheTtlMs: 5 * 60_000,
    });

    const rows: CjVideoRow[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { list?: CjVideoRow[] })?.list)
        ? ((data as { list: CjVideoRow[] }).list)
        : [];

    return rows.map((row) => ({
      id: String(row.videoId || row.id || ""),
      url: row.videoUrl || null,
      name: row.videoName ?? null,
      coverUrl: row.coverURL || null,
      type: mapVideoType(row.videoType),
      durationSec: typeof row.duration === "number" ? row.duration : null,
      width: typeof row.width === "number" ? row.width : null,
      height: typeof row.height === "number" ? row.height : null,
    })).filter((v) => v.id);
  } catch {
    return [];
  }
}

export async function fetchCjProduct(
  supplierProductId: string
): Promise<SupplierProductDetail | null> {
  const data = await cjRequest<CjProductQuery>({
    operation: "product.query",
    method: "GET",
    path: "/product/query",
    query: {
      pid: supplierProductId,
      features: "enable_combine,enable_video,enable_inventory",
    },
    cacheTtlMs: 60_000,
  });

  if (!data?.pid && !data?.productSku) return null;

  const videos = await fetchCjVideos(supplierProductId);
  const mapped = mapCjProductDetail(
    { ...data, pid: data.pid || supplierProductId },
    videos
  );
  return mapped.id ? mapped : null;
}

export async function fetchCjInventorySnapshot(
  supplierProductId: string
): Promise<SupplierInventorySnapshot | null> {
  const product = await fetchCjProduct(supplierProductId);
  if (!product) {
    return {
      supplierProductId,
      sku: null,
      price: null,
      currency: "USD",
      stock: 0,
      available: false,
      warehouse: null,
      checkedAt: new Date(),
    };
  }

  return {
    supplierProductId: product.id,
    sku: product.sku,
    price: product.price,
    currency: product.currency,
    stock: product.stock,
    available: (product.stock ?? 0) > 0,
    warehouse: product.warehouse,
    checkedAt: new Date(),
  };
}

/** Fields present on raw CJ payload that we intentionally capture or report. */
export const CJ_DOCUMENTED_PRODUCT_FIELDS = [
  "pid",
  "productName",
  "productNameEn",
  "productNameSet",
  "productSku",
  "bigImage",
  "productImage",
  "productImageSet",
  "productWeight",
  "productUnit",
  "productType",
  "categoryId",
  "categoryName",
  "entryCode",
  "entryName",
  "entryNameEn",
  "materialName",
  "materialNameSet",
  "materialNameEn",
  "materialNameEnSet",
  "materialKey",
  "materialKeySet",
  "packingWeight",
  "packingName",
  "packingNameSet",
  "packingNameEn",
  "packingNameEnSet",
  "packingKey",
  "packingKeySet",
  "productKey",
  "productKeySet",
  "productKeyEn",
  "productKeyEnSet",
  "productPro",
  "productProSet",
  "productProEn",
  "productProEnSet",
  "sellPrice",
  "suggestSellPrice",
  "description",
  "productVideo",
  "status",
  "listedNum",
  "supplierName",
  "supplierId",
  "addMarkStatus",
  "createrTime",
  "customizationVersion",
  "customizationJson1",
  "customizationJson2",
  "customizationJson3",
  "customizationJson4",
  "isTestProduct",
  "sourceFrom",
  "variants",
] as const;

export function reportUnmappedCjFields(raw: Record<string, unknown>): string[] {
  const known = new Set<string>(CJ_DOCUMENTED_PRODUCT_FIELDS as unknown as string[]);
  return Object.keys(raw).filter((k) => !known.has(k)).sort();
}
