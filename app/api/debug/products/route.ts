import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/utils/logger";

export async function GET() {
  try {
    const totalProducts = await prisma.product.count();
    const activeProducts = await prisma.product.count({ where: { isActive: true } });

    let byStoreId: Array<{ storeId: string | null; _count: { _all: number } }> = [];
    try {
      // Prefer native groupBy if available
      const groupByResult = await prisma.product.groupBy({
        by: ["storeId"],
        _count: { _all: true },
      });
      byStoreId = groupByResult as Array<{ storeId: string | null; _count: { _all: number } }>;
    } catch (err) {
      // Fallback: manual aggregation if groupBy fails
      logError(err, "[debug/products] groupBy failed, using manual aggregation");
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

    return NextResponse.json({
      ok: true,
      totalProducts,
      activeProducts,
      byStoreId,
    });
  } catch (error: any) {
    logError(error, "[/api/debug/products]");
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}

