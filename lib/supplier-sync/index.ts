import { prisma } from "@/lib/prisma";
import { getSupplierAdapter } from "@/lib/suppliers";
import { SupplierAdapter, SupplierProduct } from "@/lib/suppliers/types";
import type { Supplier } from "@/lib/suppliers/types";
import { safeQuery } from "../safeQuery";

interface ProfitConfig {
  targetMarginPct?: number; // percent
  minMarkup?: number; // multiplier e.g. 1.5
}

export async function fetchSupplierProducts(
  adapter?: SupplierAdapter,
  supplier?: Supplier
): Promise<SupplierProduct[]> {
  const adp = adapter ?? (await getSupplierAdapter(supplier));
  if (!adp.fetchProducts) {
    console.warn("[supplier-sync] Adapter has no fetchProducts; returning empty");
    return [];
  }
  return adp.fetchProducts();
}

export async function matchLocalProducts(supplierProducts: SupplierProduct[], storeId: string) {
  const skus = supplierProducts.map((p) => p.supplierSku).filter(Boolean);
  if (skus.length === 0) return [];

  const locals = await safeQuery(
    () =>
      prisma.product.findMany({
        where: { supplierSku: { in: skus }, storeId },
        select: {
          id: true,
          name: true,
          supplierSku: true,
          supplierPrice: true,
          price: true,
          stock: true,
        },
      }),
    [],
    "supplier-sync:locals"
  );

  const map = new Map<string, SupplierProduct>();
  supplierProducts.forEach((p) => map.set(p.supplierSku, p));

  return locals
    .map((product) => ({
      product,
      supplier: map.get(product.supplierSku || ""),
    }))
    .filter((pair): pair is { product: typeof locals[number]; supplier: SupplierProduct } => Boolean(pair.supplier));
}

export function profitCalculation(
  product: { price: number },
  supplierProduct: SupplierProduct,
  config?: ProfitConfig
) {
  const cost = supplierProduct.price;
  const targetMarginPct = config?.targetMarginPct ?? 55; // default 55%
  const minMarkup = config?.minMarkup ?? 1.5;

  const targetPrice = Math.max(cost * minMarkup, cost / (1 - targetMarginPct / 100));
  return {
    cost,
    suggestedPrice: Number(targetPrice.toFixed(2)),
    marginPct: Math.round(((targetPrice - cost) / targetPrice) * 100),
  };
}

export async function updateLocalProduct(
  storeId: string,
  product: { id: string; supplierPrice: number | null; stock: number },
  supplierProduct: SupplierProduct,
  dryRun = true
) {
  const data = {
    supplierPrice: supplierProduct.price,
    stock: supplierProduct.inStock ? Math.max(product.stock ?? 0, 5) : 0,
  };

  if (dryRun) {
    console.log("[supplier-sync] Would update", { productId: product.id, storeId, data });
    return;
  }

  await prisma.product.update({
    where: { id: product.id, storeId },
    data,
  });
}

export async function syncRunner(storeId: string, dryRun = true) {
  // Use config fallback if no supplier provided
  const adapter = await getSupplierAdapter();
  const supplierProducts = await fetchSupplierProducts(adapter);

  const matched = await matchLocalProducts(supplierProducts, storeId);

  let updated = 0;
  for (const { product, supplier } of matched) {
    const profit = profitCalculation(product, supplier, {});
    console.log("[supplier-sync]", {
      storeId,
      productId: product.id,
      supplierSku: supplier.supplierSku,
      cost: supplier.price,
      currentPrice: product.price,
      suggestedPrice: profit.suggestedPrice,
      marginPct: profit.marginPct,
    });
    await updateLocalProduct(storeId, product, supplier, dryRun);
    updated++;
  }

  return {
    storeId,
    supplierProducts: supplierProducts.length,
    matched: matched.length,
    updated,
    dryRun,
  };
}

