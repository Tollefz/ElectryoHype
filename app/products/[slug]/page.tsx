import { prisma } from '@/lib/prisma';
import type { Metadata } from 'next';
import Link from 'next/link';
import ProductStorefront from '@/components/products/ProductStorefront';
import { cleanProductName } from '@/lib/utils/url-decode';
import { getStoreIdFromHeadersServer } from '@/lib/store-server';
import { DEFAULT_STORE_ID } from '@/lib/store';
import { safeQuery } from '@/lib/safeQuery';
import { generateProductJSONLD, generateBreadcrumbJSONLD, generateSEOMetadata } from '@/lib/seo';
import { buildProductPresentation } from '@/lib/products/presentation';
import { buildStorefrontDescription } from '@/lib/products/storefront-description';
import { TrackViewItem } from '@/components/analytics/TrackEvents';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string | string[] }>;
}

export const revalidate = 60;

const productInclude = {
  variants: {
    where: { isActive: true },
    orderBy: { price: 'asc' as const },
  },
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const storeId = await getStoreIdFromHeadersServer();

  const product = await safeQuery(
    () =>
      prisma.product.findFirst({
        where: { slug, storeId },
        select: {
          name: true,
          description: true,
          shortDescription: true,
          metaTitle: true,
          metaDescription: true,
          images: true,
          category: true,
          specs: true,
        },
      }),
    null,
    'product:metadata'
  );

  if (!product) {
    return {
      title: 'Produkt ikke funnet | ElectroHypeX',
      description: 'Produktet du leter etter ble ikke funnet.',
    };
  }

  let images: string[] = [];
  try {
    if (typeof product.images === 'string') images = JSON.parse(product.images);
    else if (Array.isArray(product.images)) images = product.images as string[];
  } catch {
    images = [];
  }

  const cleanedName = cleanProductName(product.metaTitle || product.name);
  let rawSpecs: Record<string, string> = {};
  try {
    if (product.specs && typeof product.specs === 'object') {
      rawSpecs = product.specs as Record<string, string>;
    } else if (typeof product.specs === 'string') {
      rawSpecs = JSON.parse(product.specs);
    }
  } catch {
    rawSpecs = {};
  }

  const copy = buildStorefrontDescription({
    title: cleanedName,
    category: product.category,
    shortDescription: product.shortDescription || product.metaDescription,
    description: product.description,
    specs: rawSpecs,
  });

  return generateSEOMetadata({
    title: cleanedName,
    description: copy.shortText || 'Kjøp produkt hos ElectroHypeX',
    url: `/products/${slug}`,
    images:
      images.length > 0
        ? [{ url: images[0], width: 1200, height: 630, alt: cleanedName }]
        : [],
    keywords: [cleanedName, product.category || '', 'elektronikk', 'Norge', 'kjøp', 'nettbutikk'],
    type: 'product',
    canonical: `/products/${slug}`,
  });
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const variantParam = Array.isArray(sp.variant) ? sp.variant[0] : sp.variant;
  const headerStoreId = await getStoreIdFromHeadersServer();
  const safeStoreId =
    headerStoreId && headerStoreId !== 'demo-store' ? headerStoreId : DEFAULT_STORE_ID;

  let product =
    (await safeQuery(
      () =>
        prisma.product.findFirst({
          where: { slug, storeId: safeStoreId, isActive: true },
          include: productInclude,
        }),
      null,
      'product:detail:strategy1'
    )) ||
    (safeStoreId !== DEFAULT_STORE_ID
      ? await safeQuery(
          () =>
            prisma.product.findFirst({
              where: { slug, storeId: DEFAULT_STORE_ID, isActive: true },
              include: productInclude,
            }),
          null,
          'product:detail:strategy2'
        )
      : null) ||
    (await safeQuery(
      () =>
        prisma.product.findFirst({
          where: { slug, isActive: true, storeId: { not: 'demo-store' } },
          include: productInclude,
        }),
      null,
      'product:detail:strategy3'
    )) ||
    (await safeQuery(
      () =>
        prisma.product.findFirst({
          where: { slug, storeId: { not: 'demo-store' } },
          include: productInclude,
        }),
      null,
      'product:detail:strategy4'
    ));

  if (!product) {
    return (
      <main className="min-h-screen bg-slate-50 py-12">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <h1 className="mb-3 text-2xl font-bold text-gray-900 sm:text-3xl">
              Produktet er ikke tilgjengelig
            </h1>
            <p className="mb-6 text-sm text-gray-600 sm:text-base">
              Vi klarte ikke å hente produktdetaljene akkurat nå. Produktet kan ha blitt fjernet
              eller flyttet.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/products"
                className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                Se alle produkter
              </Link>
              <Link
                href="/tilbud"
                className="inline-flex items-center justify-center rounded-lg border-2 border-green-600 px-6 py-3 text-sm font-semibold text-green-600 hover:bg-green-50"
              >
                Se tilbud
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const relatedProducts = await safeQuery(
    async () => {
      const { pickRelatedProducts } = await import(
        '@/lib/storefront/related-products'
      );
      const storeFilter =
        safeStoreId !== 'demo-store' ? safeStoreId : DEFAULT_STORE_ID;
      const select = {
        id: true,
        name: true,
        slug: true,
        price: true,
        compareAtPrice: true,
        images: true,
        category: true,
        subcategory: true,
        tags: true,
        qualityScore: true,
        description: true,
        shortDescription: true,
        metaTitle: true,
        metaDescription: true,
        aiCategorySuggested: true,
        aiCategoryReason: true,
      } as const;

      const sameCategory = product.category
        ? await prisma.product.findMany({
            where: {
              id: { not: product.id },
              isActive: true,
              storeId: storeFilter,
              category: product.category,
            },
            select,
            take: 36,
            orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
          })
        : [];

      const priceBand = await prisma.product.findMany({
        where: {
          id: {
            notIn: [product.id, ...sameCategory.map((c) => c.id)],
          },
          isActive: true,
          storeId: storeFilter,
          price: {
            gte: Math.max(0, Number(product.price) * 0.5),
            lte: Number(product.price) * 1.8,
          },
        },
        select,
        take: 24,
        orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
      });

      const candidates = [...sameCategory, ...priceBand];
      return pickRelatedProducts(
        {
          id: product.id,
          name: product.name,
          category: product.category,
          price: Number(product.price),
          tags: product.tags,
        },
        candidates.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          price: Number(c.price),
          compareAtPrice:
            c.compareAtPrice != null ? Number(c.compareAtPrice) : null,
          images: c.images,
          category: c.category,
          tags: c.tags,
          qualityScore: c.qualityScore,
        })),
        4
      );
    },
    [],
    'product:related'
  );

  // Single presentation layer — supplier-agnostic storefront DTO
  const presentation = buildProductPresentation({
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    category: product.category,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice != null ? Number(product.compareAtPrice) : null,
    stock: product.stock,
    isActive: product.isActive,
    shortDescription: product.shortDescription,
    description: product.description,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    images: product.images,
    videos: product.videos,
    specs: product.specs,
    tags: product.tags,
    variants: product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
      image: v.image,
      attributes: v.attributes,
      stock: v.stock,
      isActive: v.isActive,
    })),
    related: relatedProducts,
    activeVariantParam: variantParam,
  });

  const gtin =
    product.variants.find((v) => v.barcode?.trim())?.barcode?.trim() ||
    undefined;
  const mpn = product.sku || product.supplierSku || undefined;

  const productJSONLD = generateProductJSONLD({
    name: presentation.title,
    description: presentation.jsonLd.description,
    image: presentation.media.images,
    price: presentation.price,
    compareAtPrice: presentation.compareAtPrice,
    currency: 'NOK',
    availability: presentation.availability.purchasable ? 'InStock' : 'OutOfStock',
    sku: presentation.sku || undefined,
    gtin,
    mpn,
    brand: 'ElectroHypeX',
    category: presentation.category,
    url: `/products/${presentation.slug}`,
    condition: 'NewCondition',
  });

  const breadcrumbJSONLD = generateBreadcrumbJSONLD(
    presentation.breadcrumbs.map((b) => ({ name: b.name, url: b.href }))
  );

  const viewItem = {
    item_id: presentation.id,
    item_name: presentation.title,
    item_brand: 'ElectroHypeX',
    item_category: presentation.category,
    price: presentation.price,
    quantity: 1,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJSONLD) }}
      />
      <TrackViewItem item={viewItem} />
      <ProductStorefront presentation={presentation} />
    </>
  );
}
