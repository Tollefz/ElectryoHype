import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/utils/logger";

export async function GET() {
  try {
    // Get all products grouped by storeId
    let byStoreId: Array<{ storeId: string | null; _count: { _all: number } }> = [];
    
    try {
      // Use Prisma groupBy
      const groupResult = await prisma.product.groupBy({
        by: ["storeId"],
        _count: { _all: true },
      });
      byStoreId = groupResult.map((item) => ({
        storeId: item.storeId,
        _count: { _all: item._count._all },
      }));
    } catch (e) {
      logError(e, "[/api/debug/store-ids] groupBy failed, falling back to manual aggregation");
      // Fallback: manual aggregation
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

    // Get sample products from each storeId to identify which is which
    const storeDetails = await Promise.all(
      byStoreId.map(async ({ storeId }) => {
        const sampleProducts = await prisma.product.findMany({
          where: { storeId: storeId ?? undefined },
          take: 5,
          select: {
            id: true,
            name: true,
            category: true,
            storeId: true,
          },
          orderBy: { createdAt: "desc" },
        });

        return {
          storeId: storeId ?? "null",
          count: byStoreId.find((s) => s.storeId === storeId)?._count._all ?? 0,
          sampleProducts: sampleProducts.map((p) => ({
            name: p.name,
            category: p.category,
          })),
        };
      })
    );

    logInfo(`Found ${byStoreId.length} unique storeIds`, "[api/debug/store-ids]");

    return NextResponse.json({
      ok: true,
      storeIds: byStoreId.map((s) => ({
        storeId: s.storeId ?? "null",
        count: s._count._all,
      })),
      details: storeDetails,
      recommendation: storeDetails.find((s) => 
        s.sampleProducts.some((p) => 
          p.category && 
          !["Sport", "Klær"].includes(p.category) &&
          (p.name.toLowerCase().includes("elektro") || 
           p.name.toLowerCase().includes("gaming") ||
           p.name.toLowerCase().includes("pc") ||
           p.category.toLowerCase().includes("elektronikk"))
        )
      )?.storeId || storeDetails[0]?.storeId || "electrohype",
    });
  } catch (error: any) {
    logError(error, "[/api/debug/store-ids] error");
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
