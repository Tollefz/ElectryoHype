import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/ProductCard";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Truck, Shield, CreditCard, Headphones, AlertTriangle } from "lucide-react";
import { getCategoriesWithCounts } from "@/lib/utils/product-count";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { NewsletterForm } from "@/components/NewsletterForm";
import { isDatabaseConfigured, isDevelopment } from "@/lib/utils/database-check";

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

const baseUrl = process.env.NEXTAUTH_URL || "https://www.electrohypex.com";

export const metadata: Metadata = {
  title: "ElectroHypeX - Beste elektronikk til beste priser",
  description: "Kjøp elektronikk, gaming-utstyr, mobil og tilbehør til beste priser. Gratis frakt over 500 kr. Rask levering i hele Norge.",
  keywords: ["elektronikk", "gaming", "mobil", "tilbehør", "Norge", "nettbutikk", "elektronikkbutikk"],
  openGraph: {
    title: "ElectroHypeX - Beste elektronikk til beste priser",
    description: "Kjøp elektronikk, gaming-utstyr, mobil og tilbehør til beste priser. Gratis frakt over 500 kr.",
    type: "website",
    url: baseUrl,
    siteName: "ElectroHypeX",
    images: [
      {
        url: `${baseUrl}/og-image.jpg`, // TODO: Legg til faktisk OG image
        width: 1200,
        height: 630,
        alt: "ElectroHypeX - Elektronikkbutikk",
      }
    ],
    locale: "nb_NO",
  },
  twitter: {
    card: "summary_large_image",
    title: "ElectroHypeX - Beste elektronikk til beste priser",
    description: "Kjøp elektronikk, gaming-utstyr, mobil og tilbehør til beste priser.",
  },
  alternates: {
    canonical: baseUrl,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default async function HomePage() {
  const headerStoreId = await getStoreIdFromHeadersServer();
  // Use DEFAULT_STORE_ID (Electro Hype) as default
  const primaryStoreId = headerStoreId || DEFAULT_STORE_ID;

  let products: Array<{
    id: string;
    name: string;
    slug: string;
    price: number;
    compareAtPrice: number | null;
    images: any;
    category: string | null;
  }> = [];

  let featuredProducts: Array<typeof products[number]> = [];
  let categories: Array<{ name: string; image: string; count: number }> = [];
  let loadError: string | null = null;
  let usedStoreId = primaryStoreId;
  let isDbConfigured = isDatabaseConfigured();
  const isDev = isDevelopment();

  // In development, if database is not configured, skip queries and show banner
  if (isDev && !isDbConfigured) {
    // Return empty data - will show "Database not configured" banner
    loadError = null; // Not an error, just not configured
  } else {
    try {
      // Primary query with current store
      const [latest, featured, categoriesWithCounts] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          storeId: primaryStoreId !== "demo-store" ? primaryStoreId : DEFAULT_STORE_ID,
          // Exclude Sport and Klær categories
          category: {
            notIn: ["Sport", "Klær", "Sport & Trening"],
          },
        },
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAtPrice: true,
          images: true,
          category: true,
          isActive: true,
          storeId: true,
        },
      }),
      prisma.product.findMany({
        where: {
          isActive: true,
          storeId: primaryStoreId !== "demo-store" ? primaryStoreId : DEFAULT_STORE_ID,
          compareAtPrice: { 
            not: null,
            gt: 0,
          },
          // Exclude Sport and Klær categories
          category: {
            notIn: ["Sport", "Klær", "Sport & Trening"],
          },
        },
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAtPrice: true,
          images: true,
          category: true,
          isActive: true,
          storeId: true,
        },
      }),
      getCategoriesWithCounts(primaryStoreId),
    ]);

    products = latest.map((p) => ({
      ...p,
      price: Number(p.price),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
    }));

    // Filter to only show products where compareAtPrice > price (actual discount)
    featuredProducts = featured
      .filter((p) => {
        const price = Number(p.price);
        const compareAtPrice = p.compareAtPrice ? Number(p.compareAtPrice) : null;
        return compareAtPrice && compareAtPrice > price;
      })
      .map((p) => ({
        ...p,
        price: Number(p.price),
        compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
      }))
      .slice(0, 4);

    const categoryImageMap: Record<string, string> = {
      "PC & Data": "https://placehold.co/300x200/f5f5f5/333?text=PC",
      Gaming: "https://placehold.co/300x200/f5f5f5/333?text=Gaming",
      "TV & Lyd": "https://placehold.co/300x200/f5f5f5/333?text=TV",
      Mobil: "https://placehold.co/300x200/f5f5f5/333?text=Mobil",
      "Mobil & Tilbehør": "https://placehold.co/300x200/f5f5f5/333?text=Mobil",
      Hvitevarer: "https://placehold.co/300x200/f5f5f5/333?text=Hvitevarer",
      "Smart Home": "https://placehold.co/300x200/f5f5f5/333?text=SmartHome",
      Elektronikk: "https://placehold.co/300x200/f5f5f5/333?text=Elektronikk",
      Datamaskiner: "https://placehold.co/300x200/f5f5f5/333?text=PC",
    };

    categories = categoriesWithCounts
      .filter(cat => cat.name !== "Sport" && cat.name !== "Klær" && cat.name !== "Sport & Trening") // Filter out Sport and Klær
      .slice(0, 6)
      .map((cat) => ({
        name: cat.name,
        image:
          categoryImageMap[cat.name] ||
          "https://placehold.co/300x200/f5f5f5/333?text=" + encodeURIComponent(cat.name),
        count: cat.count,
      }));

    // Fallback: if no products, try DEFAULT_STORE_ID (Electro Hype) but NOT demo-store
    if (products.length === 0 && primaryStoreId !== DEFAULT_STORE_ID) {
      const fallbackStoreId = DEFAULT_STORE_ID;
      
      if (fallbackStoreId) {
        console.log(`[home] no products for storeId="${primaryStoreId}", trying fallback="${fallbackStoreId}"`);

        const [fallbackLatest, fallbackFeatured, fallbackCategories] = await Promise.all([
          prisma.product.findMany({
            where: { 
              isActive: true, 
              storeId: fallbackStoreId,
              category: {
                notIn: ["Sport", "Klær"],
              },
            },
            take: 8,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              compareAtPrice: true,
              images: true,
              category: true,
              isActive: true,
              storeId: true,
            },
          }),
          prisma.product.findMany({
            where: {
              isActive: true,
              storeId: fallbackStoreId,
              compareAtPrice: { 
                not: null,
                gt: 0,
              },
              category: {
                notIn: ["Sport", "Klær"],
              },
            },
            take: 8,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              compareAtPrice: true,
              images: true,
              category: true,
              isActive: true,
              storeId: true,
            },
          }),
          getCategoriesWithCounts(fallbackStoreId),
        ]);

        products = fallbackLatest.map((p) => ({
          ...p,
          price: Number(p.price),
          compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
        }));
        // Filter to only show products where compareAtPrice > price (actual discount)
        featuredProducts = fallbackFeatured
          .filter((p) => {
            const price = Number(p.price);
            const compareAtPrice = p.compareAtPrice ? Number(p.compareAtPrice) : null;
            return compareAtPrice && compareAtPrice > price;
          })
          .map((p) => ({
            ...p,
            price: Number(p.price),
            compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
          }))
          .slice(0, 4);
        categories = fallbackCategories
          .filter(cat => cat.name !== "Sport" && cat.name !== "Klær" && cat.name !== "Sport & Trening") // Filter out Sport and Klær
          .slice(0, 6)
          .map((cat) => ({
            name: cat.name,
            image:
              categoryImageMap[cat.name] ||
              "https://placehold.co/300x200/f5f5f5/333?text=" + encodeURIComponent(cat.name),
            count: cat.count,
          }));
        usedStoreId = fallbackStoreId;
      } else {
        usedStoreId = primaryStoreId;
      }
    } else {
      usedStoreId = primaryStoreId;
    }
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === "development";
    
    // Enhanced error logging in development
    if (isDev) {
      console.error("❌ [home] Failed to load homepage data");
      console.error("   Error:", error?.message || "Unknown error");
      
      // Check for Prisma-specific errors
      if (error?.name === "PrismaClientInitializationError") {
        console.error("   Type: Prisma Client Initialization Error");
        if (error?.cause) {
          console.error("   Cause:", error.cause);
        }
        console.error("\n💡 Common fixes:");
        console.error("   1. Check DATABASE_URL in .env file");
        console.error("   2. Ensure database is accessible");
        console.error("   3. Run: npx prisma generate");
        console.error("   4. Run: npx prisma migrate dev");
      } else if (error?.code === "P1001") {
        console.error("   Type: Database connection error");
        console.error("   Database server is unreachable");
        console.error("\n💡 Fix: Check DATABASE_URL and network connection");
      } else if (error?.code === "P1000") {
        console.error("   Type: Database authentication error");
        console.error("   Authentication failed");
        console.error("\n💡 Fix: Check database credentials in DATABASE_URL");
      } else if (error?.code === "P1003") {
        console.error("   Type: Database not found");
        console.error("   Database does not exist");
        console.error("\n💡 Fix: Check database name in DATABASE_URL");
      }
      
      if (error?.stack) {
        console.error("   Stack:", error.stack);
      }
    } else {
      console.error("[home] Failed to load homepage data", error);
    }
    
    // Safe error message for user
    // In production, always show error
    // In development, only show if DB was configured (otherwise we show banner)
    if (!isDev || isDbConfigured) {
      loadError = error?.message ?? "Kunne ikke hente data fra databasen.";
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Database Not Configured Banner (Dev Only) */}
      {isDev && !isDbConfigured && (
        <div className="bg-yellow-50 border-b-2 border-yellow-400">
          <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-800 mb-1">
                  Database not configured
                </h3>
                <p className="text-sm text-yellow-700 mb-2">
                  DATABASE_URL is missing or invalid. The app is running in development mode with empty data.
                </p>
                <div className="text-xs text-yellow-600 space-y-1">
                  <p><strong>To fix:</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-2">
                    <li>Create a <code className="bg-yellow-100 px-1 rounded">.env</code> file in the project root</li>
                    <li>Add: <code className="bg-yellow-100 px-1 rounded">DATABASE_URL="postgresql://user:password@host/database?sslmode=require"</code></li>
                    <li>Get your DATABASE_URL from <a href="https://console.neon.tech" target="_blank" rel="noopener noreferrer" className="underline">Neon Dashboard</a> → Connection Details</li>
                    <li>Restart the dev server: <code className="bg-yellow-100 px-1 rounded">npm run dev</code></li>
                  </ol>
                  <p className="mt-2">
                    See <a href="/docs/local-setup" className="underline">Local Setup Guide</a> for detailed instructions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* HERO BANNER */}
      <section className="bg-gradient-to-br from-slate-100 to-white">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-20 lg:py-24">
          <div className="w-full rounded-xl shadow-lg bg-white p-8 sm:p-10 lg:p-12 xl:p-14">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <span className="mb-4 inline-block rounded-full bg-green-600 px-4 py-1.5 text-sm font-semibold text-white">
                  🔥 Ukens kampanje
                </span>
                <h1 className="mb-4 text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-semibold text-gray-900 leading-tight">
                  Beste elektronikk til <span className="text-green-600">beste priser</span>
                </h1>
                <p className="mb-6 text-base sm:text-lg text-gray-700 max-w-xl">
                  Elektronikk, gaming og hjem – levert raskt i hele Norge
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    href="/tilbud"
                    className="rounded-full bg-green-600 px-6 py-3 text-base font-semibold text-white hover:bg-green-700 transition-colors text-center shadow-sm hover:shadow-md"
                  >
                    Se tilbud
                  </Link>
                  <Link
                    href="/products"
                    className="rounded-full border-2 border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-center"
                  >
                    Alle produkter
                  </Link>
                </div>
              </div>
              <div className="relative h-64 sm:h-80 lg:h-96 hidden lg:block">
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gradient-to-br from-green-50 to-gray-100">
                  <div className="text-8xl lg:text-9xl">🎮</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MEST POPULÆRE KATEGORIER */}
      <section className="py-8 sm:py-12 lg:py-16 bg-white">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 sm:mb-8 flex items-center justify-between">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">Mest populære kategorier</h2>
            <Link href="/products" className="hidden sm:flex items-center text-sm font-semibold text-green-600 hover:text-green-700 hover:underline">
              Se alle <ChevronRight size={16} />
            </Link>
          </div>
          {loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
              <p className="font-semibold">Kunne ikke laste kategorier</p>
              <p className="text-sm">{loadError}</p>
            </div>
          ) : categories.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
              {categories.map((cat) => (
                <Link
                  key={cat.name}
                  href={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:border-green-600 hover:shadow-md"
                >
                  <div className="relative h-24 sm:h-32 bg-gray-50">
                    <Image
                      src={cat.image}
                      alt={`${cat.name} kategori`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      className="object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2 sm:p-3 text-center">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
                      {cat.count} {cat.count === 1 ? "produkt" : "produkter"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-border bg-white p-8 text-center text-secondary">
              <p>Ingen kategorier tilgjengelig for øyeblikket.</p>
            </div>
          )}
        </div>
      </section>

      {/* USP BAR */}
      <section className="mt-8 sm:mt-10 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Truck className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">Fri frakt</p>
                <p className="text-[10px] sm:text-xs text-gray-600">Over 500,-</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">Trygg handel</p>
                <p className="text-[10px] sm:text-xs text-gray-600">Sikker betaling</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">Sikker betaling</p>
                <p className="text-[10px] sm:text-xs text-gray-600">Via Stripe</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Headphones className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">Kundeservice</p>
                <p className="text-[10px] sm:text-xs text-gray-600">Man-Fre 09-18</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* UKENS TILBUD */}
      <section className="py-6 sm:py-8 lg:py-10">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xl sm:text-2xl">🔥</span>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Ukens tilbud</h2>
              <span className="rounded-full bg-red-500 px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold text-white">
                SPAR OPP TIL 40%
              </span>
            </div>
            <Link href="/tilbud" className="hidden sm:flex items-center text-sm font-semibold text-green-600 hover:text-green-700 hover:underline">
              Se alle tilbud <ChevronRight size={16} />
            </Link>
          </div>
          {loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 sm:p-6 text-red-700">
              <p className="font-semibold">Kunne ikke laste tilbud</p>
              <p className="text-sm">{loadError}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {(featuredProducts.length > 0 ? featuredProducts : products.slice(0, 4)).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
              {featuredProducts.length === 0 && products.length === 0 && (
                <div className="col-span-full rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-600">
                  Ingen produkter tilgjengelig akkurat nå.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* POPULÆRE PRODUKTER */}
      <section className="py-8 sm:py-12 lg:py-16 bg-gray-50">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 sm:mb-8 flex items-center justify-between">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">Populære produkter</h2>
            <Link href="/products" className="hidden sm:flex items-center text-sm font-semibold text-green-600 hover:text-green-700 hover:underline">
              Se alle produkter <ChevronRight size={16} />
            </Link>
          </div>
          {loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
              <p className="font-semibold">Kunne ikke laste produkter</p>
              <p className="text-sm">{loadError}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.length === 0 && (
                <div className="col-span-full rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-600">
                  Ingen produkter tilgjengelig akkurat nå.
                </div>
              )}
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* NYHETSBREV */}
      <section className="bg-gray-900 py-8 sm:py-12">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="mb-2 text-xl sm:text-2xl font-bold text-white">
            Få eksklusive tilbud rett i innboksen
          </h2>
          <p className="mb-4 sm:mb-6 text-sm sm:text-base text-gray-400">
            Meld deg på vårt nyhetsbrev og få 10% rabatt på første ordre!
          </p>
          <NewsletterForm />
        </div>
      </section>
    </main>
  );
}
