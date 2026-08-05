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
import { getCategoryBySlug, getAllCategorySlugs } from "@/lib/categories";
import { ListingAnalytics } from "@/components/analytics/ListingAnalytics";
import { generateSEOMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { withDatabaseCircuit } from "@/lib/ops/db-circuit";

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function resolveSearchParams(searchParams: ProductsPageProps["searchParams"]) {
  const raw = await searchParams;
  return {
    category: firstParam(raw.category),
    page: firstParam(raw.page),
    q: firstParam(raw.q),
    query: firstParam(raw.query),
    sort: firstParam(raw.sort),
    minPrice: firstParam(raw.minPrice),
    maxPrice: firstParam(raw.maxPrice),
    inStock: firstParam(raw.inStock),
  };
}

export async function generateMetadata({ searchParams }: ProductsPageProps): Promise<Metadata> {
  const params = await resolveSearchParams(searchParams);
  const categorySlug = params.category;
  const categoryDef = getCategoryBySlug(categorySlug);
  const categoryName = categoryDef?.label;
  const title = categoryName ? `${categoryName} - ElectroHypeX` : "Produkter - ElectroHypeX";
  const description = categoryName 
    ? `Utforsk vårt utvalg av ${categoryName.toLowerCase()}. Gratis frakt over 500 kr. Rask levering i hele Norge.`
    : "Utforsk vårt utvalg av elektronikk, gaming-utstyr, mobil og tilbehør. Gratis frakt over 500 kr.";
  const path = `/products${categorySlug ? `?category=${categorySlug}` : ""}`;

  return generateSEOMetadata({
    title,
    description,
    url: path,
    canonical: path,
    keywords: categoryName
      ? [categoryName.toLowerCase(), "elektronikk", "gaming", "mobil", "tilbehør", "Norge"]
      : ["produkter", "elektronikk", "gaming", "mobil", "tilbehør", "Norge"],
  });
}

const PAGE_SIZE = 12;

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await resolveSearchParams(searchParams);
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
  const inStockOnly = params.inStock === "true";

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

  // Filter by stock if requested
  if (inStockOnly) {
    where.stock = {
      gt: 0,
    };
  }

  let productsRaw: Array<{
    id: string;
    name: string;
    slug: string;
    price: number | Prisma.Decimal;
    compareAtPrice: number | Prisma.Decimal | null;
    images: string;
    category: string | null;
    isActive: boolean;
  }> = [];
  let total = 0;
  let loadError: string | null = null;
  let usedStoreId = storeId;

  const orderByMap: Record<string, Prisma.ProductOrderByWithRelationInput> = {
    "price-asc": { price: "asc" },
    "price-desc": { price: "desc" },
    name: { name: "asc" },
    newest: { createdAt: "desc" },
  };
  const orderBy = orderByMap[sort] ?? { createdAt: "desc" };

  const primary = await withDatabaseCircuit("products:list", async () => {
    const [primaryProducts, primaryTotal] = await Promise.all([
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
    ]);
    return { products: primaryProducts, total: primaryTotal, storeId: safeStoreId };
  });

  if (!primary.ok) {
    loadError = primary.error.reason || "Kunne ikke hente produkter.";
  } else {
    productsRaw = primary.data.products;
    total = primary.data.total;
    usedStoreId = primary.data.storeId;

    if (productsRaw.length === 0 && safeStoreId !== DEFAULT_STORE_ID) {
      const fallbackWhere: Prisma.ProductWhereInput = {
        ...where,
        storeId: DEFAULT_STORE_ID,
        category: categoryFilter,
      };
      const fallback = await withDatabaseCircuit("products:fallback", async () => {
        const [fallbackProducts, fallbackTotal] = await Promise.all([
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
        ]);
        return {
          products: fallbackProducts,
          total: fallbackTotal,
          storeId: DEFAULT_STORE_ID,
        };
      });
      if (fallback.ok) {
        productsRaw = fallback.data.products;
        total = fallback.data.total;
        usedStoreId = fallback.data.storeId;
      }
    }
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
    category: product.category,
  }));

  // Quiet debug — strings only, no Error objects
  if (process.env.NEXT_PUBLIC_DEBUG === "true") {
    console.warn(
      `[products page] count=${products.length} store=${usedStoreId}`
    );
  }

  // Get category name for display
  const resolvedCategoryName = categoryName || null;

  return (
    <div className="ehx-page-bg min-h-screen">
      <ListingAnalytics
        listId={categorySlug || "all-products"}
        listName={resolvedCategoryName || "Alle produkter"}
        searchTerm={params.q || params.query}
        items={products.map((product, index) => ({
          item_id: product.id,
          item_name: product.name,
          item_brand: "ElectroHypeX",
          item_category: product.category || undefined,
          price: product.price,
          quantity: 1,
          index,
        }))}
      />
      <div className="ehx-container py-8 sm:py-10 lg:py-12">
        <div className="mb-8 sm:mb-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="ehx-heading-2">
                {resolvedCategoryName ? resolvedCategoryName : "Alle produkter"}
              </h1>
              <p className="ehx-body mt-2">
                {total} {total === 1 ? "produkt" : "produkter"}
                {query ? ` for «${query}»` : ""}
              </p>
            </div>
            <div className="hidden md:block">
              <Suspense fallback={<div className="h-10 w-36 animate-pulse rounded-[var(--ehx-radius-md)] bg-[var(--ehx-image-bg)]" />}>
                <SortDropdown />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="mb-5 flex gap-2 md:hidden">
          <Suspense fallback={<div className="h-10 flex-1 animate-pulse rounded-[var(--ehx-radius-md)] bg-[var(--ehx-image-bg)]" />}>
            <MobileFilterButton categories={sidebarCategories} />
          </Suspense>
          <Suspense fallback={<div className="h-10 w-32 animate-pulse rounded-[var(--ehx-radius-md)] bg-[var(--ehx-image-bg)]" />}>
            <SortDropdown />
          </Suspense>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <Suspense fallback={<div className="hidden h-96 w-72 shrink-0 animate-pulse rounded-[var(--ehx-radius-md)] bg-[var(--ehx-image-bg)] lg:block" />}>
            <aside className="hidden w-72 shrink-0 lg:sticky lg:top-28 lg:block lg:self-start">
              <FilterSidebar categories={sidebarCategories} />
            </aside>
          </Suspense>

          <div className="min-w-0 flex-1 pb-4">
            {isUnknownCategory && (
              <div className="mb-6 rounded-[var(--ehx-radius-md)] border border-blue-200 bg-blue-50 p-4 sm:p-5">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Fant ikke kategorien &quot;{categorySlug}&quot;.</span> Viser alle produkter i stedet.
                </p>
              </div>
            )}
            {loadError ? (
              <div className="rounded-[var(--ehx-radius-md)] border border-amber-200 bg-amber-50 p-5 text-amber-950">
                <p className="font-semibold">Kunne ikke laste produkter</p>
                <p className="text-sm text-amber-900/90">{loadError}</p>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-[var(--ehx-radius-md)] border border-[var(--border)] bg-white p-10 text-center sm:p-14">
                <h2 className="ehx-heading-3 mb-3">
                  {resolvedCategoryName
                    ? `Ingen produkter i denne kategorien ennå`
                    : "Ingen produkter matcher filtrene dine"}
                </h2>
                <p className="ehx-body mx-auto mb-8 max-w-md">
                  {resolvedCategoryName
                    ? "Vi jobber med å utvide sortimentet. I mellomtiden kan du se andre kategorier."
                    : "Prøv å justere filtrene eller søk etter noe annet."}
                </p>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    href="/products"
                    className="ehx-btn ehx-btn-primary px-6 py-2.5"
                  >
                    Se alle produkter
                  </Link>
                  {resolvedCategoryName && (
                    <Link
                      href="/tilbud"
                      className="ehx-btn ehx-btn-secondary px-6 py-2.5"
                    >
                      Se tilbud
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="ehx-product-grid-listing">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
            <Suspense fallback={<div className="mt-8 h-10 w-full animate-pulse rounded-[var(--ehx-radius-md)] bg-[var(--ehx-image-bg)]" />}>
              <Pagination currentPage={page} totalPages={totalPages} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

