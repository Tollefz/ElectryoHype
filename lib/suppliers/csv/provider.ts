/**
 * CSV reference provider — proves Supplier Engine is plug-and-play.
 * Not a production CSV importer; a contract compliance adapter.
 */

import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import { SupplierName, SupplierProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueMappedProducts } from "@/lib/suppliers/enqueue";
import { ensureDefaultSupplierAccount } from "@/lib/suppliers/accounts";
import { facetsFromGetProduct } from "@/lib/suppliers/provider-facets";
import type {
  SupplierImportResult,
  SupplierProductDetail,
  SupplierProvider,
  SupplierSearchFilters,
  SupplierSearchResult,
  SupplierVideo,
} from "@/lib/suppliers/provider";
import { convertPriceToNOK } from "@/lib/import/pricing";

type CsvRow = {
  id: string;
  sku?: string;
  title: string;
  description?: string;
  price: number;
  currency?: string;
  stock?: number;
  category?: string;
  warehouse?: string;
  images?: string;
  specs?: string;
  attributes?: string;
  videos?: string;
  supplierUrl?: string;
};

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    if (!obj.id || !obj.title) continue;
    rows.push({
      id: obj.id,
      sku: obj.sku || undefined,
      title: obj.title,
      description: obj.description || "",
      price: Number(obj.price || 0),
      currency: obj.currency || "USD",
      stock: obj.stock != null && obj.stock !== "" ? Number(obj.stock) : 0,
      category: obj.category || undefined,
      warehouse: obj.warehouse || undefined,
      images: obj.images || undefined,
      specs: obj.specs || undefined,
      attributes: obj.attributes || undefined,
      videos: obj.videos || undefined,
      supplierUrl: obj.supplier_url || obj.supplierurl || undefined,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseKv(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, String(v)])
      );
    }
  } catch {
    /* key:value;key:value */
  }
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.split(":");
    if (!k?.trim()) continue;
    out[k.trim()] = rest.join(":").trim();
  }
  return out;
}

function parseVideos(raw?: string): SupplierVideo[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v, i) => ({
        id: String(v.id || i),
        url: v.url || null,
        name: v.name || null,
        coverUrl: v.coverUrl || null,
        type: v.type || "video",
        durationSec: v.durationSec ?? null,
        width: v.width ?? null,
        height: v.height ?? null,
      }));
    }
  } catch {
    /* urls separated by | */
  }
  return raw
    .split("|")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url, i) => ({
      id: `csv-vid-${i}`,
      url,
      name: null,
      coverUrl: null,
      type: "video",
      durationSec: null,
      width: null,
      height: null,
    }));
}

function rowToDetail(row: CsvRow): SupplierProductDetail {
  const images = (row.images || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    id: row.id,
    sku: row.sku || row.id,
    title: row.title,
    description: row.description || "",
    images,
    sourceImages: images,
    price: row.price,
    currency: row.currency || "USD",
    category: row.category || null,
    categoryId: null,
    stock: row.stock ?? 0,
    deliveryTime: null,
    weightGrams: null,
    weightRaw: null,
    packingWeightRaw: null,
    warehouse: row.warehouse || null,
    variants: [],
    specifications: parseKv(row.specs),
    attributes: parseKv(row.attributes),
    videos: parseVideos(row.videos),
    supplierUrl: row.supplierUrl || null,
    shippingEstimate: null,
    listedCount: null,
    suggestSellPriceRaw: null,
    status: "available",
    raw: row,
  };
}

async function loadCatalog(): Promise<SupplierProductDetail[]> {
  const filePath =
    process.env.CSV_CATALOG_PATH ||
    path.join(process.cwd(), "data", "csv-catalog", "sample-catalog.csv");
  try {
    const text = await readFile(filePath, "utf8");
    return parseCsv(text).map(rowToDetail);
  } catch {
    return [];
  }
}

export function createCsvCatalogProvider(): SupplierProvider {
  const getProduct = async (supplierProductId: string) => {
    const all = await loadCatalog();
    return all.find((p) => p.id === supplierProductId) || null;
  };

  const normalizeProduct = (raw: unknown): SupplierProductDetail => {
    if (raw && typeof raw === "object" && "id" in (raw as object) && "title" in (raw as object)) {
      return rowToDetail(raw as CsvRow);
    }
    throw new Error("CSV normalizeProduct: invalid row");
  };

  const facets = facetsFromGetProduct(getProduct, normalizeProduct);

  return {
    id: "csv",
    displayName: "CSV / egen API",

    async isConfigured() {
      const rows = await loadCatalog();
      return rows.length > 0;
    },

    async searchProducts(filters: SupplierSearchFilters): Promise<SupplierSearchResult> {
      const all = await loadCatalog();
      const q = (filters.query || "").toLowerCase().trim();
      let filtered = all;
      if (q) {
        filtered = all.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            (p.sku || "").toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q)
        );
      }
      if (filters.minPrice != null) {
        filtered = filtered.filter((p) => p.price >= filters.minPrice!);
      }
      if (filters.maxPrice != null) {
        filtered = filtered.filter((p) => p.price <= filters.maxPrice!);
      }
      if (filters.minStock != null) {
        filtered = filtered.filter((p) => (p.stock ?? 0) >= filters.minStock!);
      }
      if (filters.warehouse) {
        filtered = filtered.filter(
          (p) => (p.warehouse || "").toUpperCase() === filters.warehouse!.toUpperCase()
        );
      }

      const page = Math.max(1, filters.page || 1);
      const pageSize = Math.min(50, Math.max(1, filters.pageSize || 20));
      const start = (page - 1) * pageSize;
      const slice = filtered.slice(start, start + pageSize);

      return {
        products: slice.map((p) => ({
          id: p.id,
          sku: p.sku,
          title: p.title,
          imageUrl: p.images[0] || null,
          price: p.price,
          currency: p.currency,
          category: p.category,
          categoryId: p.categoryId,
          rating: null,
          stock: p.stock,
          deliveryTime: p.deliveryTime,
          weightGrams: p.weightGrams,
          variantCount: p.variants.length,
          warehouse: p.warehouse,
          listedCount: p.listedCount,
          supplierUrl: p.supplierUrl,
        })),
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      };
    },

    getProduct,
    normalizeProduct,
    ...facets,

    async importProducts(supplierProductIds, opts): Promise<SupplierImportResult> {
      const account = await ensureDefaultSupplierAccount("csv");
      const details: SupplierProductDetail[] = [];
      for (const id of supplierProductIds) {
        const d = await getProduct(id);
        if (d) details.push(d);
      }
      return enqueueMappedProducts("csv", details, {
        createdById: opts?.createdById,
        createdByEmail: opts?.createdByEmail,
        storeId: opts?.storeId,
        supplierAccountId: opts?.supplierAccountId || account.id,
      });
    },

    async syncInventory(supplierProductIds?) {
      const products = await prisma.product.findMany({
        where: {
          supplierName: SupplierName.csv,
          ...(supplierProductIds?.length
            ? { supplierProductId: { in: supplierProductIds } }
            : { supplierProductId: { not: null } }),
        },
        select: { id: true, supplierProductId: true },
        take: 200,
      });
      let updated = 0;
      let unavailable = 0;
      const snapshots = [];
      for (const product of products) {
        if (!product.supplierProductId) continue;
        const snap = await facets.getInventory(product.supplierProductId);
        if (!snap) {
          unavailable += 1;
          continue;
        }
        snapshots.push(snap);
        await prisma.product.update({
          where: { id: product.id },
          data: {
            stock: snap.stock ?? 0,
            supplierInventory: snap.stock,
            supplierStatus: snap.available
              ? SupplierProductStatus.available
              : SupplierProductStatus.out_of_stock,
            warehouse: snap.warehouse,
            lastInventoryCheck: snap.checkedAt,
            supplierLastSync: snap.checkedAt,
          },
        });
        updated += 1;
      }
      return { checked: products.length, updated, unavailable, snapshots };
    },

    async syncPrice(supplierProductIds?) {
      const products = await prisma.product.findMany({
        where: {
          supplierName: SupplierName.csv,
          ...(supplierProductIds?.length
            ? { supplierProductId: { in: supplierProductIds } }
            : { supplierProductId: { not: null } }),
        },
        select: { id: true, supplierProductId: true },
        take: 200,
      });
      let updated = 0;
      for (const product of products) {
        if (!product.supplierProductId) continue;
        const pricing = await facets.getPricing(product.supplierProductId);
        if (!pricing) continue;
        await prisma.product.update({
          where: { id: product.id },
          data: {
            supplierPrice: convertPriceToNOK(pricing.price, pricing.currency),
            supplierCurrency: pricing.currency,
            supplierLastSync: new Date(),
          },
        });
        updated += 1;
      }
      return { checked: products.length, updated };
    },
  };
}
