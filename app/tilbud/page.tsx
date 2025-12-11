import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/ProductCard";
import Link from "next/link";
import { ChevronRight, Tag } from "lucide-react";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import type { Metadata } from "next";

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

const baseUrl = process.env.NEXTAUTH_URL || "https://elektrohype.no";

export const metadata: Metadata = {
  title: "Tilbud - ElektroHype",
  description: "Se våre beste tilbud på elektronikk, gaming-utstyr og mobil. Spesialpriser og rabatter på utvalgte produkter.",
  keywords: ["tilbud", "rabatt", "elektronikk", "gaming", "mobil", "Norge", "nettbutikk"],
  openGraph: {
    title: "Tilbud - ElektroHype",
    description: "Se våre beste tilbud på elektronikk, gaming-utstyr og mobil.",
    type: "website",
    url: `${baseUrl}/tilbud`,
    siteName: "ElektroHype",
  },
  alternates: {
    canonical: `${baseUrl}/tilbud`,
  },
};

/**
 * Henter produkter med rabatt fra databasen.
 */
async function getDiscountedProducts(storeId: string) {
  return prisma.product.findMany({
    where: {
      isActive: true,
      storeId: storeId !== "demo-store" ? storeId : DEFAULT_STORE_ID,
      compareAtPrice: {
        not: null,
        gt: 0,
      },
      // Exclude Sport and Klær categories
      category: {
        notIn: ["Sport", "Klær", "Sport & Trening"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      category: true,
    },
  });
}

export default async function TilbudPage() {
  const headerStoreId = await getStoreIdFromHeadersServer();
  // Use DEFAULT_STORE_ID (Electro Hype) as default
  const primaryStoreId = headerStoreId || DEFAULT_STORE_ID;

  let discountedProducts: Awaited<ReturnType<typeof getDiscountedProducts>> = [];
  let loadError: string | null = null;
  let usedStoreId = primaryStoreId;

  try {
    discountedProducts = await getDiscountedProducts(primaryStoreId);
    // Fallback: if no offers for primary store, try DEFAULT_STORE_ID (Electro Hype)
    if (discountedProducts.length === 0 && primaryStoreId !== DEFAULT_STORE_ID) {
      console.log(`[tilbud] no products for storeId, falling back to '${DEFAULT_STORE_ID}'`, {
        storeId: primaryStoreId,
      });
      discountedProducts = await getDiscountedProducts(DEFAULT_STORE_ID);
      usedStoreId = DEFAULT_STORE_ID;
    }
  } catch (error: any) {
    console.error("[tilbud] Failed to load discounted products", error);
    loadError = error?.message ?? "Kunne ikke hente tilbudsprodukter.";
  }

  // Filtrer produkter hvor compareAtPrice faktisk er høyere enn price
  const actualDiscounted = discountedProducts.filter((product) => {
    if (!product.compareAtPrice) return false;
    return Number(product.compareAtPrice) > Number(product.price);
  });

  // Beregn gjennomsnittlig rabatt
  const averageDiscount = actualDiscounted.length > 0
    ? Math.round(
        actualDiscounted.reduce((sum, p) => {
          const discount = ((Number(p.compareAtPrice) - Number(p.price)) / Number(p.compareAtPrice)) * 100;
          return sum + discount;
        }, 0) / actualDiscounted.length
      )
    : 0;

  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-8 lg:py-10">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-6 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Ukens tilbud</span>
        </nav>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
            <Tag className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Ukens tilbud</h1>
          </div>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600">
            {actualDiscounted.length > 0 
              ? `Opptil ${averageDiscount}% rabatt på utvalgte produkter. Begrenset tid!`
              : 'Sjekk tilbake senere for nye tilbud.'}
          </p>
        </div>

        {/* Antall produkter */}
        {actualDiscounted.length > 0 && (
          <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm font-semibold text-green-700">
              {actualDiscounted.length} produkt{actualDiscounted.length !== 1 ? 'er' : ''} på tilbud
            </p>
          </div>
        )}

        {/* Produkter */}
        {loadError ? (
          <div className="rounded-xl bg-white p-12 text-center border border-red-200 bg-red-50 text-red-700">
            <Tag className="mx-auto mb-4 h-16 w-16 text-red-400" />
            <h2 className="mb-2 text-2xl font-bold">Kunne ikke laste tilbud</h2>
            <p className="mb-6 text-sm">{loadError}</p>
          </div>
        ) : actualDiscounted.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {actualDiscounted.map((product) => {
              const images = typeof product.images === "string" ? JSON.parse(product.images) : product.images || [];

              const discount = Math.round(
                ((Number(product.compareAtPrice) - Number(product.price)) / Number(product.compareAtPrice)) * 100
              );

              return (
                <div key={product.id} className="relative">
                  {/* Stor rabatt-badge */}
                  <div className="absolute -left-2 -top-2 z-10 rounded-full bg-sale px-3 py-1 text-sm font-bold text-white shadow-lg">
                    -{discount}%
                  </div>
                  <ProductCard
                    product={{
                      id: product.id,
                      name: product.name,
                      slug: product.slug,
                      price: Number(product.price),
                      compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
                      images: images,
                      category: product.category,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
            <Tag className="mx-auto mb-4 h-12 w-12 sm:h-16 sm:w-16 text-gray-300" />
            <h2 className="mb-2 text-xl sm:text-2xl font-bold text-gray-900">Ingen tilbud akkurat nå</h2>
            <p className="mb-6 text-sm sm:text-base text-gray-600">Sjekk tilbake senere for nye tilbud!</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Se alle produkter
              <ChevronRight size={18} className="sm:w-5 sm:h-5" />
            </Link>
          </div>
        )}

        {/* Call to action */}
        {actualDiscounted.length > 0 && (
          <section className="mt-8 sm:mt-12 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 p-6 sm:p-8 lg:p-10 text-center text-white">
            <h2 className="mb-2 text-xl sm:text-2xl lg:text-3xl font-bold">Glemt å sjekke noe?</h2>
            <p className="mb-4 sm:mb-6 text-sm sm:text-base text-gray-300">
              Se vårt fulle utvalg av elektronikk og tech-produkter
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-white px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white hover:bg-white hover:text-gray-900 transition-colors"
            >
              Se alle produkter
              <ChevronRight size={18} className="sm:w-5 sm:h-5" />
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

