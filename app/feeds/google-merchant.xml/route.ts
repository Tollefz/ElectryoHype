import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/safeQuery";
import {
  buildGoogleMerchantRss,
  buildMerchantItemXml,
  merchantFeedStoreFilter,
  type MerchantFeedProduct,
} from "@/lib/merchant/google-feed";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Google Merchant Center primary product feed.
 * Schedule fetch: https://www.electrohypex.com/feeds/google-merchant.xml
 */
export async function GET() {
  const products = await safeQuery(
    () =>
      prisma.product.findMany({
        where: merchantFeedStoreFilter(),
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          shortDescription: true,
          metaDescription: true,
          price: true,
          compareAtPrice: true,
          images: true,
          category: true,
          sku: true,
          supplierSku: true,
          stock: true,
          isActive: true,
          variants: {
            where: { isActive: true },
            select: {
              barcode: true,
              sku: true,
              stock: true,
              isActive: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
    [] as MerchantFeedProduct[],
    "merchant-feed"
  );

  const items: string[] = [];
  for (const p of products) {
    const xml = buildMerchantItemXml({
      ...p,
      price: Number(p.price),
      compareAtPrice:
        p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
    });
    if (xml) items.push(xml);
  }

  const body = buildGoogleMerchantRss(items);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
