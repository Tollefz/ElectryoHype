import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
  const storeId = getStoreIdFromHeaders(headers());
  const page = Math.max(1, Number(params.page ?? "1"));
  const category = params.category ?? undefined;
  // Støtt både 'q' og 'query' for søkeparameter
  const query = params.q ?? params.query ?? undefined;
  const sort = params.sort ?? "newest";
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    storeId,
    ...(category ? { category } : {}),
    ...(query
      ? {
          name: {
            contains: query,
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

  let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
  switch (sort) {
    case "price-asc":
      orderBy = { price: "asc" };
      break;
    case "price-desc":
      orderBy = { price: "desc" };
      break;
    case "name":
      orderBy = { name: "asc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const [productsRaw, total, categoryRecords] = await Promise.all([
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

  // Get category name for display if filtering by category
  const categoryName = category 
    ? categories.find(cat => cat.toLowerCase() === category.toLowerCase()) || category
    : null;

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-secondary">
              {categoryName ? categoryName : 'Produkter'}
            </p>
            <h1 className="text-3xl font-bold text-primary">
              {categoryName ? categoryName : 'Utforsk sortimentet'}
            </h1>
            {categoryName && (
              <p className="mt-2 text-sm text-gray-medium">
                {total} {total === 1 ? 'produkt' : 'produkter'} i denne kategorien
              </p>
            )}
          </div>
          <SortDropdown />
        </div>
        <div className="grid gap-8 lg:grid-cols-[280px,1fr]">
          <FilterSidebar categories={categories} />
          <div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products.length === 0 && (
                <div className="col-span-full rounded-lg border border-border bg-white p-8 text-center">
                  <p className="text-lg font-semibold text-secondary mb-2">
                    {categoryName 
                      ? `Ingen produkter i kategorien "${categoryName}"`
                      : 'Ingen produkter matcher filtrene dine'}
                  </p>
                  <p className="text-sm text-gray-medium mb-4">
                    {categoryName 
                      ? 'Prøv å se på andre kategorier eller søk etter produkter.'
                      : 'Prøv å justere filtrene eller søk etter noe annet.'}
                  </p>
                  {categoryName && (
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
            <Pagination currentPage={page} totalPages={totalPages} />
          </div>
        </div>
      </div>
    </div>
  );
}

