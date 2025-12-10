import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/utils/logger";

/**
 * Debug route to check Temu products in database
 * 
 * This route helps identify:
 * - How many Temu products exist
 * - What storeId they use
 * - Sample products with their data
 */
export async function GET() {
  try {
    // Find products with supplierName = "temu" or supplierUrl containing "temu"
    const temuProducts = await prisma.product.findMany({
      where: {
        OR: [
          { supplierName: "temu" },
          { supplierUrl: { contains: "temu", mode: "insensitive" } },
          { sku: { startsWith: "TEMU-" } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        compareAtPrice: true,
        category: true,
        storeId: true,
        images: true,
        supplierUrl: true,
        supplierName: true,
        sku: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20, // Sample 20 products
    });

    // Count total Temu products
    const totalTemuProducts = await prisma.product.count({
      where: {
        OR: [
          { supplierName: "temu" },
          { supplierUrl: { contains: "temu", mode: "insensitive" } },
          { sku: { startsWith: "TEMU-" } },
        ],
      },
    });

    // Group by storeId
    const byStoreId = await prisma.product.groupBy({
      by: ["storeId"],
      where: {
        OR: [
          { supplierName: "temu" },
          { supplierUrl: { contains: "temu", mode: "insensitive" } },
          { sku: { startsWith: "TEMU-" } },
        ],
      },
      _count: {
        id: true,
      },
    });

    // Count active vs inactive
    const activeCount = await prisma.product.count({
      where: {
        OR: [
          { supplierName: "temu" },
          { supplierUrl: { contains: "temu", mode: "insensitive" } },
          { sku: { startsWith: "TEMU-" } },
        ],
        isActive: true,
      },
    });

    // Parse images for sample products
    const sampleProducts = temuProducts.slice(0, 5).map((p) => {
      let images: string[] = [];
      try {
        if (typeof p.images === "string") {
          images = JSON.parse(p.images);
        } else if (Array.isArray(p.images)) {
          images = p.images;
        }
      } catch (e) {
        // Ignore parse errors
      }

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        storeId: p.storeId,
        price: Number(p.price),
        compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
        imageCount: images.length,
        firstImage: images[0] || null,
        sku: p.sku,
        supplierUrl: p.supplierUrl,
        isActive: p.isActive,
      };
    });

    logInfo(`Found ${totalTemuProducts} Temu products (${activeCount} active)`, "[api/debug/temu-products]");

    return NextResponse.json({
      ok: true,
      total: totalTemuProducts,
      active: activeCount,
      inactive: totalTemuProducts - activeCount,
      byStoreId: byStoreId.map((s) => ({
        storeId: s.storeId,
        count: s._count.id,
      })),
      sampleProducts,
      recommendation: byStoreId.length > 0
        ? byStoreId[0].storeId || "null"
        : "No Temu products found",
    });
  } catch (error: any) {
    logError(error, "[api/debug/temu-products]");
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}

