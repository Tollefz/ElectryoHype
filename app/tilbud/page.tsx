import ProductCard from "@/components/ProductCard";
import Link from "next/link";
import { ChevronRight, Tag } from "lucide-react";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import type { Metadata } from "next";
import { withDatabaseCircuit } from "@/lib/ops/db-circuit";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

const baseUrl = process.env.NEXTAUTH_URL || "https://www.electrohypex.com";

export const metadata: Metadata = {
  title: "Tilbud - ElectroHypeX",
  description:
    "Se våre beste tilbud på elektronikk, gaming-utstyr og mobil. Spesialpriser og rabatter på utvalgte produkter.",
  keywords: [
    "tilbud",
    "rabatt",
    "elektronikk",
    "gaming",
    "mobil",
    "Norge",
    "nettbutikk",
  ],
  openGraph: {
    title: "Tilbud - ElectroHypeX",
    description:
      "Se våre beste tilbud på elektronikk, gaming-utstyr og mobil.",
    type: "website",
    url: `${baseUrl}/tilbud`,
    siteName: "ElektroHype",
  },
  alternates: {
    canonical: `${baseUrl}/tilbud`,
  },
};

async function loadDiscounted(storeId: string) {
  return prisma.product.findMany({
    where: {
      isActive: true,
      storeId: storeId !== "demo-store" ? storeId : DEFAULT_STORE_ID,
      compareAtPrice: { not: null, gt: 0 },
      category: { notIn: ["Sport", "Klær", "Sport & Trening"] },
    },
    orderBy: { createdAt: "desc" },
    take: 120,
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
  const primaryStoreId = headerStoreId || DEFAULT_STORE_ID;

  let result = await withDatabaseCircuit("tilbud:primary", () =>
    loadDiscounted(primaryStoreId)
  );

  if (
    result.ok &&
    result.data.length === 0 &&
    primaryStoreId !== DEFAULT_STORE_ID
  ) {
    result = await withDatabaseCircuit("tilbud:fallback", () =>
      loadDiscounted(DEFAULT_STORE_ID)
    );
  }

  const discountedProducts = result.ok ? result.data : [];
  const loadError = result.ok
    ? null
    : result.error.reason || "Kunne ikke hente tilbudsprodukter.";

  const actualDiscounted = discountedProducts.filter((product) => {
    if (!product.compareAtPrice) return false;
    return Number(product.compareAtPrice) > Number(product.price);
  });

  const averageDiscount =
    actualDiscounted.length > 0
      ? Math.round(
          actualDiscounted.reduce((sum, p) => {
            const discount =
              ((Number(p.compareAtPrice) - Number(p.price)) /
                Number(p.compareAtPrice)) *
              100;
            return sum + discount;
          }, 0) / actualDiscounted.length
        )
      : 0;

  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-8 lg:py-7">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-6 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">
            Hjem
          </Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Ukens tilbud</span>
        </nav>

        <div className="mb-6 sm:mb-8">
          <div className="mb-3 flex items-center gap-2 sm:mb-4 sm:gap-3">
            <Tag className="h-6 w-6 text-green-600 sm:h-8 sm:w-8" />
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
              Ukens tilbud
            </h1>
          </div>
          <p className="text-sm text-gray-600 sm:text-base lg:text-lg">
            {actualDiscounted.length > 0
              ? `Opptil ${averageDiscount}% rabatt på utvalgte produkter. Begrenset tid!`
              : "Sjekk tilbake senere for nye tilbud."}
          </p>
        </div>

        {actualDiscounted.length > 0 && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4">
            <p className="text-xs font-semibold text-green-700 sm:text-sm">
              {actualDiscounted.length} produkt
              {actualDiscounted.length !== 1 ? "er" : ""} på tilbud
            </p>
          </div>
        )}

        {loadError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-12 text-center text-amber-950">
            <Tag className="mx-auto mb-4 h-16 w-16 text-amber-400" />
            <h2 className="mb-2 text-2xl font-bold">Kunne ikke laste tilbud</h2>
            <p className="mb-6 text-sm">{loadError}</p>
          </div>
        ) : actualDiscounted.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {actualDiscounted.map((product) => {
              const images =
                typeof product.images === "string"
                  ? JSON.parse(product.images)
                  : product.images || [];

              const discount = Math.round(
                ((Number(product.compareAtPrice) - Number(product.price)) /
                  Number(product.compareAtPrice)) *
                  100
              );

              return (
                <div key={product.id} className="relative">
                  <div className="absolute -left-2 -top-2 z-10 rounded-full bg-sale px-3 py-1 text-sm font-bold text-white shadow-lg">
                    -{discount}%
                  </div>
                  <ProductCard
                    product={{
                      id: product.id,
                      name: product.name,
                      slug: product.slug,
                      price: Number(product.price),
                      compareAtPrice: product.compareAtPrice
                        ? Number(product.compareAtPrice)
                        : null,
                      images: images,
                      category: product.category,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <Tag className="mx-auto mb-4 h-12 w-12 text-gray-300 sm:h-16 sm:w-16" />
            <h2 className="mb-2 text-xl font-bold text-gray-900 sm:text-2xl">
              Ingen tilbud akkurat nå
            </h2>
            <p className="mb-6 text-sm text-gray-600 sm:text-base">
              Sjekk tilbake senere for nye tilbud!
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 sm:px-6 sm:py-3 sm:text-base"
            >
              Se alle produkter
              <ChevronRight size={18} className="sm:h-5 sm:w-5" />
            </Link>
          </div>
        )}

        {actualDiscounted.length > 0 && (
          <section className="mt-6 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-center text-white sm:mt-8 sm:p-8 lg:p-10">
            <h2 className="mb-2 text-xl font-bold sm:text-2xl lg:text-3xl">
              Glemt å sjekke noe?
            </h2>
            <p className="mb-4 text-sm text-gray-300 sm:mb-6 sm:text-base">
              Se vårt fulle utvalg av elektronikk og tech-produkter
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-white px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-gray-900 sm:px-6 sm:py-3 sm:text-base"
            >
              Se alle produkter
              <ChevronRight size={18} className="sm:h-5 sm:w-5" />
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
