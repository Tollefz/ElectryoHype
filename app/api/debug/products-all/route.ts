import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/utils/logger";

/**
 * Debug route to inspect ALL products in database
 * 
 * This helps identify:
 * - Total product count
 * - Products per storeId
 * - Products per isActive status
 * - Sample products with their properties
 */
export async function GET() {
  try {
    // Total count
    const total = await prisma.product.count();
    
    // Count by storeId
    let byStoreId: Array<{ storeId: string | null; _count: { _all: number } }> = [];
    try {
      const groupResult = await prisma.product.groupBy({
        by: ["storeId"],
        _count: { _all: true },
      });
      byStoreId = groupResult.map((item) => ({
        storeId: item.storeId,
        _count: { _all: item._count._all },
      }));
    } catch (e) {
      logError(e, "[api/debug/products-all] groupBy failed, using manual aggregation");
      const all = await prisma.product.findMany({
        select: { storeId: true },
      });
      const map = new Map<string | null, number>();
      for (const row of all) {
        const key = row.storeId ?? "null";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      byStoreId = Array.from(map.entries()).map(([storeId, count]) => ({
        storeId,
        _count: { _all: count },
      }));
    }

    // Count by isActive
    const activeCount = await prisma.product.count({ where: { isActive: true } });
    const inactiveCount = await prisma.product.count({ where: { isActive: false } });

    // Count by supplierName (to identify Temu products)
    let bySupplier: Array<{ supplierName: string | null; _count: { _all: number } }> = [];
    try {
      const groupResult = await prisma.product.groupBy({
        by: ["supplierName"],
        _count: { _all: true },
      });
      bySupplier = groupResult.map((item) => ({
        supplierName: item.supplierName,
        _count: { _all: item._count._all },
      }));
    } catch (e) {
      // Fallback if groupBy fails
      const all = await prisma.product.findMany({
        select: { supplierName: true },
      });
      const map = new Map<string | null, number>();
      for (const row of all) {
        const key = row.supplierName ?? "null";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      bySupplier = Array.from(map.entries()).map(([supplierName, count]) => ({
        supplierName,
        _count: { _all: count },
      }));
    }

    // Get sample products from each storeId
    const samplesByStore: Record<string, any[]> = {};
    for (const store of byStoreId) {
      const storeId = store.storeId ?? "null";
      const samples = await prisma.product.findMany({
        where: { storeId: store.storeId },
        select: {
          id: true,
          name: true,
          category: true,
          storeId: true,
          isActive: true,
          supplierName: true,
          supplierUrl: true,
          createdAt: true,
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      });
      samplesByStore[storeId] = samples;
    }

    // Get ALL products without filters (first 50 for inspection)
    const allProductsSample = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        storeId: true,
        isActive: true,
        supplierName: true,
        supplierUrl: true,
        createdAt: true,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    // Count Temu products specifically
    const temuCount = await prisma.product.count({
      where: {
        OR: [
          { supplierName: "temu" },
          { supplierUrl: { contains: "temu", mode: "insensitive" } },
          { sku: { startsWith: "TEMU-" } },
        ],
      },
    });

    logInfo(`Found ${total} total products (${activeCount} active, ${inactiveCount} inactive, ${temuCount} Temu)`, "[api/debug/products-all]");

    return NextResponse.json({
      ok: true,
      summary: {
        total,
        active: activeCount,
        inactive: inactiveCount,
        temu: temuCount,
      },
      byStoreId: byStoreId.map((s) => ({
        storeId: s.storeId,
        count: s._count._all,
      })),
      bySupplier: bySupplier.map((s) => ({
        supplierName: s.supplierName,
        count: s._count._all,
      })),
      samplesByStore,
      allProductsSample: allProductsSample.slice(0, 20), // Limit to 20 for readability
      recommendation: total <= 12 
        ? "Very few products found. Temu products may not be in this database."
        : total > 50 && temuCount === 0
        ? "Many products found but no Temu products. Check supplierName field."
        : "Products found. Check samplesByStore to see distribution.",
    });
  } catch (error: any) {
    logError(error, "[api/debug/products-all]");
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}

