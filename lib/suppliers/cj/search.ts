import "server-only";

import { cjRequest } from "@/lib/suppliers/cj/api";
import type {
  SupplierSearchFilters,
  SupplierSearchProduct,
  SupplierSearchResult,
  SupplierSortBy,
} from "@/lib/suppliers/provider";

type CjListV2Product = {
  id?: string;
  nameEn?: string;
  sku?: string;
  spu?: string;
  bigImage?: string;
  sellPrice?: string | number;
  nowPrice?: string | number;
  discountPrice?: string | number;
  listedNum?: number;
  categoryId?: string;
  threeCategoryName?: string;
  warehouseInventoryNum?: number;
  totalVerifiedInventory?: number;
  deliveryCycle?: string;
  saleStatus?: string;
};

type CjListV2Data = {
  pageSize?: number;
  pageNumber?: number;
  totalRecords?: number;
  totalPages?: number;
  content?: Array<{
    productList?: CjListV2Product[];
  }>;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapOrderBy(sortBy?: SupplierSortBy): { orderBy: number; sort: "asc" | "desc" } {
  switch (sortBy) {
    case "bestsellers":
      return { orderBy: 1, sort: "desc" };
    case "newest":
      return { orderBy: 3, sort: "desc" };
    case "price_asc":
      return { orderBy: 2, sort: "asc" };
    case "price_desc":
      return { orderBy: 2, sort: "desc" };
    case "stock":
      return { orderBy: 4, sort: "desc" };
    case "rating":
    case "relevance":
    default:
      return { orderBy: 0, sort: "desc" };
  }
}

function mapProduct(row: CjListV2Product): SupplierSearchProduct {
  const price =
    toNumber(row.discountPrice) ??
    toNumber(row.nowPrice) ??
    toNumber(row.sellPrice) ??
    0;
  const stock =
    toNumber(row.totalVerifiedInventory) ??
    toNumber(row.warehouseInventoryNum);

  return {
    id: String(row.id || ""),
    sku: row.sku || row.spu || null,
    title: row.nameEn || row.sku || "Uten tittel",
    imageUrl: row.bigImage || null,
    price,
    currency: "USD",
    category: row.threeCategoryName || null,
    categoryId: row.categoryId || null,
    rating: null,
    stock,
    deliveryTime: row.deliveryCycle || null,
    weightGrams: null,
    variantCount: 1,
    warehouse: null,
    listedCount: typeof row.listedNum === "number" ? row.listedNum : null,
    supplierUrl: row.id
      ? `https://cjdropshipping.com/product/${row.id}`
      : null,
    raw: row,
  };
}

export async function searchCjProducts(
  filters: SupplierSearchFilters
): Promise<SupplierSearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const { orderBy, sort } = mapOrderBy(filters.sortBy);

  const data = await cjRequest<CjListV2Data>({
    operation: "product.listV2",
    method: "GET",
    path: "/product/listV2",
    query: {
      keyWord: filters.query || undefined,
      page,
      size: pageSize,
      categoryId: filters.categoryId || undefined,
      countryCode: filters.warehouse || undefined,
      startSellPrice: filters.minPrice,
      endSellPrice: filters.maxPrice,
      startWarehouseInventory: filters.minStock,
      endWarehouseInventory: filters.maxStock,
      orderBy,
      sort,
      features: "enable_category",
    },
    cacheTtlMs: 30_000,
  });

  const products = (data?.content?.[0]?.productList || [])
    .map(mapProduct)
    .filter((p) => p.id);

  // Client-side delivery filter when CJ only exposes cycle strings like "3-5"
  const filtered =
    filters.maxDeliveryDays != null
      ? products.filter((p) => {
          if (!p.deliveryTime) return true;
          const m = p.deliveryTime.match(/(\d+)/);
          if (!m) return true;
          return Number(m[1]) <= (filters.maxDeliveryDays as number);
        })
      : products;

  const total = data?.totalRecords ?? filtered.length;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / pageSize));

  return {
    products: filtered,
    page: data?.pageNumber ?? page,
    pageSize: data?.pageSize ?? pageSize,
    total,
    totalPages,
  };
}

export async function getCjCategories(): Promise<unknown> {
  return cjRequest({
    operation: "product.getCategory",
    method: "GET",
    path: "/product/getCategory",
    cacheTtlMs: 6 * 60 * 60 * 1000,
  });
}
