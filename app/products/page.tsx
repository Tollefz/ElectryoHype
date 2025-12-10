import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { FilterSidebar } from "@/components/products/FilterSidebar";
import { SortDropdown } from "@/components/products/SortDropdown";
import { Pagination } from "@/components/products/Pagination";
import { getStoreIdFromHeaders } from "@/lib/store";
import { headers } from "next/headers";

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
}

const PAGE_SIZE = 12;

async function getParams(searchParams: ProductsPageProps["searchParams"]) {
  return searchParams instanceof Promise ? await searchParams : searchParams;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await getParams(searchParams);
  const headersList = await headers();
  const headerStoreId = getStoreIdFromHeaders(headersList);
  const storeId = headerStoreId || "default-store";
  const page = Math.max(1, Number(params.page ?? "1"));
  const categorySlug = params.category ?? undefined;
  const CATEGORY_MAP: Record<string, string> = {
    data: "Data & IT",
    gaming: "Gaming",
    "mobil-tilbehor": "Mobil & Tilbehør",
  };
  const categoryName = categorySlug ? CATEGORY_MAP[categorySlug] : undefined;
  // Støtt både 'q' og 'query' for søkeparameter
  const query = params.q ?? params.query ?? undefined;
  const sort = params.sort ?? "newest";
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    storeId,
    ...(categorySlug && categoryName
      ? {
          category: {
            equals: categoryName,
          },
        }
      : {}),
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
          storeId,
          category: { not: null },
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

    // Fallback: if no products and storeId is not default-store, try default-store
    if (productsRaw.length === 0 && storeId !== "default-store") {
      console.log("[products page] no products for storeId, falling back to 'default-store'", {
        storeId,
      });
      const fallbackWhere = {
        ...where,
        storeId: "default-store",
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
            storeId: "default-store",
            category: { not: null },
            isActive: true,
          },
          distinct: ["category"],
          select: { category: true },
        }),
      ]);

      productsRaw = fallbackProducts;
      total = fallbackTotal;
      categoryRecords = fallbackCategories;
      usedStoreId = "default-store";
    }
  } catch (error: any) {
    console.error("[products:list] Failed to load products", error);
    loadError = error?.message ?? "Kunne ikke hente produkter.";
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const categories = categoryRecords
    .map((record) => record.category)
    .filter((cat): cat is string => Boolean(cat));

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

  // Get category name for display if filtering by category
  const resolvedCategoryName =
    categoryName ||
    (categorySlug
      ? categories.find((cat) => cat.toLowerCase() === categorySlug.toLowerCase()) || categorySlug
      : null);

  // Handle unknown category slug
  const unknownCategoryError =
    categorySlug && !categoryName
      ? `Ukjent kategori: ${categorySlug}`
      : null;

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-secondary">
              {resolvedCategoryName ? resolvedCategoryName : "Produkter"}
            </p>
            <h1 className="text-3xl font-bold text-primary">
              {resolvedCategoryName ? resolvedCategoryName : "Utforsk sortimentet"}
            </h1>
            {resolvedCategoryName && (
              <p className="mt-2 text-sm text-gray-medium">
                {total} {total === 1 ? "produkt" : "produkter"} i denne kategorien
              </p>
            )}
          </div>
          <Suspense fallback={<div className="h-10 w-32 rounded-lg bg-gray-200 animate-pulse" />}>
            <SortDropdown />
          </Suspense>
        </div>
        <div className="grid gap-8 lg:grid-cols-[280px,1fr]">
          <Suspense fallback={<div className="h-96 rounded-lg bg-gray-200 animate-pulse" />}>
            <FilterSidebar categories={categories} />
          </Suspense>
          <div>
            {unknownCategoryError ? (
              <div className="col-span-full rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
                <p className="font-semibold">Ukjent kategori</p>
                <p className="text-sm">{unknownCategoryError}</p>
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
                <p className="font-semibold">Kunne ikke laste produkter</p>
                <p className="text-sm">{loadError}</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products.length === 0 && (
                  <div className="col-span-full rounded-lg border border-border bg-white p-8 text-center">
                    <p className="text-lg font-semibold text-secondary mb-2">
                      {resolvedCategoryName
                        ? `Ingen produkter i kategorien "${resolvedCategoryName}"`
                        : "Ingen produkter matcher filtrene dine"}
                    </p>
                    <p className="text-sm text-gray-medium mb-4">
                      {resolvedCategoryName
                        ? "Prøv å se på andre kategorier eller søk etter produkter."
                        : "Prøv å justere filtrene eller søk etter noe annet."}
                    </p>
                    {resolvedCategoryName && (
                      <Link
                        href="/products"
                        className="inline-block rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
                      >
                        Se alle produkter
                      </Link>
                    )}
                  </div>
                )}
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

