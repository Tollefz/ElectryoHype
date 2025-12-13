import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { FilterSidebar } from "@/components/products/FilterSidebar";
import { SortDropdown } from "@/components/products/SortDropdown";
import { MobileFilterButton } from "@/components/products/MobileFilterButton";
import { Pagination } from "@/components/products/Pagination";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { getCategoryBySlug, getAllCategorySlugs, CATEGORY_DEFINITIONS } from "@/lib/categories";
import type { Metadata } from "next";

const baseUrl = process.env.NEXTAUTH_URL || "https://www.electrohypex.com";

export async function generateMetadata({ searchParams }: ProductsPageProps): Promise<Metadata> {
  const params = await getParams(searchParams);
  const categorySlug = params.category ?? undefined;
  const categoryDef = getCategoryBySlug(categorySlug);
  const categoryName = categoryDef?.label;
  const title = categoryName ? `${categoryName} - ElectroHypeX` : "Produkter - ElectroHypeX";
  const description = categoryName 
    ? `Utforsk vårt utvalg av ${categoryName.toLowerCase()}. Gratis frakt over 500 kr. Rask levering i hele Norge.`
    : "Utforsk vårt utvalg av elektronikk, gaming-utstyr, mobil og tilbehør. Gratis frakt over 500 kr.";
  
  return {
    title,
    description,
    keywords: categoryName 
      ? [categoryName.toLowerCase(), "elektronikk", "gaming", "mobil", "tilbehør", "Norge"]
      : ["produkter", "elektronikk", "gaming", "mobil", "tilbehør", "Norge"],
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseUrl}/products${categorySlug ? `?category=${categorySlug}` : ''}`,
      siteName: "ElectroHypeX",
      locale: "nb_NO",
    },
    alternates: {
      canonical: `${baseUrl}/products${categorySlug ? `?category=${categorySlug}` : ''}`,
    },
  };
}

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
}

const PAGE_SIZE = 12;

async function getParams(searchParams: ProductsPageProps["searchParams"]) {
  return searchParams instanceof Promise ? await searchParams : searchParams;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await getParams(searchParams);
  const headerStoreId = await getStoreIdFromHeadersServer();
  const storeId = headerStoreId || DEFAULT_STORE_ID;
  const page = Math.max(1, Number(params.page ?? "1"));
  const categorySlug = params.category ?? undefined;
  const categoryDef = getCategoryBySlug(categorySlug);
  const categoryName = categoryDef?.label;
  const categoryDbValue = categoryDef?.dbValue;
  
  // Handle unknown category slug - if slug exists but is not in our definitions
  const isUnknownCategory = categorySlug && !categoryDef;
  
  // Støtt både 'q' og 'query' for søkeparameter
  const query = params.q ?? params.query ?? undefined;
  const sort = params.sort ?? "newest";
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;

  // Ensure we don't query demo-store products - fallback to DEFAULT_STORE_ID (Electro Hype)
  const safeStoreId = storeId === "demo-store" ? DEFAULT_STORE_ID : storeId;
  
  // Build category filter
  // If valid category slug is provided, use it; otherwise exclude Sport and Klær
  // For unknown categories, show all products (exclude Sport and Klær)
  const categoryFilter = !isUnknownCategory && categorySlug && categoryDbValue
    ? { equals: categoryDbValue } // Use database value for known category
    : { notIn: ["Sport & Trening", "Klær", "Sport"] }; // Exclude Sport and Klær by default

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    // Use safe storeId and exclude demo-store - fallback to DEFAULT_STORE_ID (Electro Hype)
    // Also exclude null storeId (old products without storeId)
    storeId: safeStoreId && safeStoreId !== "demo-store" ? safeStoreId : DEFAULT_STORE_ID,
    // Exclude Sport and Klær categories (unless explicitly requested via categorySlug)
    category: categoryFilter,
    ...(query
      ? {
          name: {
            contains: query,
            mode: "insensitive",
          },
        }
      : {}),
  };

  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) {
      where.price.gte = minPrice;
    }
    if (maxPrice) {
      where.price.lte = maxPrice;
    }
  }

  let productsRaw: Array<{
    id: string;
    name: string;
    slug: string;
    price: number | Prisma.Decimal;
    compareAtPrice: number | Prisma.Decimal | null;
    images: any;
    category: string | null;
    isActive: boolean;
  }> = [];
  let total = 0;
  let categoryRecords: Array<{ category: string | null }> = [];
  let loadError: string | null = null;
  let usedStoreId = storeId;

  try {
    const orderByMap: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      "price-asc": { price: "asc" },
      "price-desc": { price: "desc" },
      name: { name: "asc" },
      newest: { createdAt: "desc" },
    };
    const orderBy = orderByMap[sort] ?? { createdAt: "desc" };

    // Primary query
    const [primaryProducts, primaryTotal, primaryCategories] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAtPrice: true,
          images: true,
          category: true,
          isActive: true,
        },
      }),
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: {
          storeId: safeStoreId && safeStoreId !== "demo-store" ? safeStoreId : DEFAULT_STORE_ID,
          category: { 
            not: null,
            // Exclude Sport and Klær from category list
            notIn: ["Sport", "Klær", "Sport & Trening"],
          },
          isActive: true,
        },
        distinct: ["category"],
        select: { category: true },
      }),
    ]);

    productsRaw = primaryProducts;
    total = primaryTotal;
    categoryRecords = primaryCategories;
    usedStoreId = storeId;

    // Fallback: if no products, try DEFAULT_STORE_ID (Electro Hype) but NOT demo-store
    if (productsRaw.length === 0 && safeStoreId !== DEFAULT_STORE_ID) {
      const currentFallback = DEFAULT_STORE_ID;
      
      if (currentFallback) {
        console.log(`[products page] no products for storeId="${safeStoreId}", trying fallback="${currentFallback}"`);
        const fallbackWhere: Prisma.ProductWhereInput = {
          ...where,
          storeId: currentFallback,
          // Keep category filter (excludes Sport and Klær unless explicitly requested)
          category: categoryFilter,
        };
        
      const [fallbackProducts, fallbackTotal, fallbackCategories] = await Promise.all([
        prisma.product.findMany({
          where: fallbackWhere,
          orderBy,
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            images: true,
            category: true,
            isActive: true,
          },
        }),
        prisma.product.count({ where: fallbackWhere }),
        prisma.product.findMany({
          where: {
            storeId: currentFallback,
            category: { 
              not: null,
              notIn: ["Sport", "Klær"], // Exclude sport/clothing categories
            },
            isActive: true,
          },
          distinct: ["category"],
          select: { category: true },
        }),
      ]);

      productsRaw = fallbackProducts;
      total = fallbackTotal;
      categoryRecords = fallbackCategories;
      usedStoreId = currentFallback;
      }
    }
  } catch (error: any) {
    console.error("[products:list] Failed to load products", error);
    loadError = error?.message ?? "Kunne ikke hente produkter.";
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  // Use category definitions for sidebar instead of raw DB categories
  const sidebarCategories = getAllCategorySlugs();

  const products = productsRaw.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
    images: product.images,
  }));

  // Debug logging to inspect filters and result size (server-side)
  console.log("[products page] final result count:", products.length, {
    primaryStoreId: storeId,
    actuallyUsedStoreId: usedStoreId,
    hasCategoryFilter: Boolean(where.category),
    search: query ?? null,
    minPrice: typeof minPrice === "number" ? minPrice : null,
    maxPrice: typeof maxPrice === "number" ? maxPrice : null,
  });

  // Get category name for display
  const resolvedCategoryName = categoryName || null;

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Header section */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-gray-900">
                {resolvedCategoryName ? resolvedCategoryName : "Alle produkter"}
              </h1>
              {resolvedCategoryName && (
                <p className="mt-2 text-sm sm:text-base text-slate-600">
                  {total} {total === 1 ? "produkt" : "produkter"} i denne kategorien
                </p>
              )}
            </div>
            <div className="hidden md:block">
              <Suspense fallback={<div className="h-10 w-32 rounded-lg bg-gray-200 animate-pulse" />}>
                <SortDropdown />
              </Suspense>
            </div>
          </div>
        </div>
        {/* Mobile: Filter/Sort buttons */}
        <div className="mb-4 flex gap-2 md:hidden">
          <Suspense fallback={<div className="h-10 flex-1 rounded-lg bg-gray-200 animate-pulse" />}>
            <MobileFilterButton categories={sidebarCategories} />
          </Suspense>
          <Suspense fallback={<div className="h-10 w-32 rounded-lg bg-gray-200 animate-pulse" />}>
            <SortDropdown />
          </Suspense>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          {/* Desktop: Filter sidebar */}
          <Suspense fallback={<div className="hidden lg:block h-96 w-64 rounded-lg bg-gray-200 animate-pulse" />}>
            <aside className="hidden lg:block w-64 flex-shrink-0 lg:sticky lg:top-24 lg:self-start">
              <FilterSidebar categories={sidebarCategories} />
            </aside>
          </Suspense>

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            {isUnknownCategory && (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:p-6">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Fant ikke kategorien "{categorySlug}".</span> Viser alle produkter i stedet.
                </p>
              </div>
            )}
            {loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 sm:p-6 text-red-700">
                <p className="font-semibold">Kunne ikke laste produkter</p>
                <p className="text-sm">{loadError}</p>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 sm:p-12 text-center">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-3">
                  {resolvedCategoryName
                    ? `Ingen produkter i denne kategorien ennå`
                    : "Ingen produkter matcher filtrene dine"}
                </h2>
                <p className="text-sm sm:text-base text-gray-600 mb-6 max-w-md mx-auto">
                  {resolvedCategoryName
                    ? "Vi jobber med å utvide sortimentet. I mellomtiden kan du se andre kategorier."
                    : "Prøv å justere filtrene eller søk etter noe annet."}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/products"
                    className="inline-block rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                  >
                    Se alle produkter
                  </Link>
                  {resolvedCategoryName && (
                    <Link
                      href="/tilbud"
                      className="inline-block rounded-lg border-2 border-green-600 px-6 py-2.5 text-sm font-semibold text-green-600 hover:bg-green-50 transition-colors"
                    >
                      Se tilbud
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
            <Suspense fallback={<div className="h-10 w-full rounded-lg bg-gray-200 animate-pulse mt-4" />}>
              <Pagination currentPage={page} totalPages={totalPages} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

