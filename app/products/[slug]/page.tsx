import { prisma } from '@/lib/prisma';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import ProductPageClientWrapper from '@/components/ProductPageClientWrapper';
import ProductVariantSelector from '@/components/ProductVariantSelector';
import AddToCartButton from '@/components/AddToCartButton';
import ProductCard from '@/components/ProductCard';
import ProductTabs from '@/components/ProductTabs';
import { Truck, Shield, RotateCcw, Check } from 'lucide-react';
import { cleanProductName } from '@/lib/utils/url-decode';
import { getStoreIdFromHeaders } from '@/lib/store';
import { headers } from 'next/headers';
import { safeQuery } from '@/lib/safeQuery';

interface ProductPageProps {
  params: Promise<{ slug: string }> | { slug: string };
  searchParams: Promise<{ variant?: string }> | { variant?: string };
}

type VariantDisplay = {
  id: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  attributes: Record<string, string>;
  stock: number;
  colorCode: string;
  slug: string;
};

async function getParams(params: ProductPageProps["params"]) {
  return params instanceof Promise ? await params : params;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await getParams(params);
  const headersList = await headers();
  const storeId = getStoreIdFromHeaders(headersList);
  
  const product = await safeQuery(
    () =>
      prisma.product.findFirst({
        where: { slug, storeId },
        select: {
          name: true,
          description: true,
          shortDescription: true,
          price: true,
          images: true,
          category: true,
        },
      }),
    null,
    'product:metadata'
  );

  if (!product) {
    return {
      title: 'Produkt ikke funnet | ElektroHype',
      description: 'Produktet du leter etter ble ikke funnet.',
    };
  }

  // Parse images
  let images: string[] = [];
  try {
    if (typeof product.images === 'string') {
      images = JSON.parse(product.images);
    } else if (Array.isArray(product.images)) {
      images = product.images;
    }
  } catch {
    images = [];
  }

  const cleanedName = cleanProductName(product.name);
  const description = product.shortDescription || product.description?.substring(0, 160) || 'Kjøp produkt hos ElektroHype';

  return {
    title: `${cleanedName} | ElektroHype`,
    description,
    keywords: [cleanedName, product.category || '', 'elektronikk', 'Norge'],
    openGraph: {
      title: cleanedName,
      description,
      images: images.length > 0 ? [images[0]] : [],
      type: 'website',
    },
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await getParams(params);
  const { variant: variantParam } = await (searchParams instanceof Promise ? searchParams : Promise.resolve(searchParams));
  const headersList = await headers();
  const storeId = getStoreIdFromHeaders(headersList);
  
  const product = await safeQuery(
    () =>
      prisma.product.findFirst({
        where: { slug, storeId },
        include: {
          variants: {
            where: { isActive: true },
            orderBy: { price: 'asc' },
          },
        },
      }),
    null,
    'product:detail'
  );

  if (!product) {
    return (
      <main className="min-h-screen bg-gray-light py-12">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-10 text-center shadow">
          <h1 className="mb-3 text-2xl font-bold text-dark">Produktet er ikke tilgjengelig</h1>
          <p className="mb-6 text-gray-medium">
            Vi klarte ikke å hente produktdetaljene akkurat nå. Prøv igjen senere eller se andre produkter.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
          >
            Gå til produktsiden
          </Link>
        </div>
      </main>
    );
  }

  const relatedProducts = await safeQuery(
    () =>
      prisma.product.findMany({
        where: {
          category: product.category,
          id: { not: product.id },
          isActive: true,
          storeId,
        },
        take: 4,
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAtPrice: true,
          images: true,
          category: true,
        },
      }),
    [],
    'product:related'
  );

  // Parse images with error handling
  // CRITICAL: Collect ALL images from product AND variants
  let images: string[] = [];
  try {
    if (typeof product.images === 'string') {
      images = JSON.parse(product.images);
    } else if (Array.isArray(product.images)) {
      images = product.images;
    }
  } catch (error) {
    console.error('Failed to parse images:', error);
    images = [];
  }

  // CRITICAL: Add variant images to product images array
  // This ensures all variant images are available for display
  const variantImages = product.variants
    .map((v) => v.image)
    .filter((img): img is string => 
      !!img && 
      typeof img === 'string' &&
      img.startsWith('http') && 
      !img.includes('placeholder') &&
      !img.includes('placehold.co')
    )
    .filter((img: string, idx: number, arr: string[]) => arr.indexOf(img) === idx); // Remove duplicates
  
  // Combine: variant images first (prioritized), then product images
  const imagesSet = new Set<string>();
  [...variantImages, ...images].forEach((img: string) => {
    if (img && typeof img === 'string' && img.length > 0) {
      imagesSet.add(img);
    }
  });
  
  // Preserve order: variant images first, then others
  images = [...variantImages, ...Array.from(imagesSet).filter(img => !variantImages.includes(img))];
  
  console.log(`[Product Page] Collected ${images.length} total images (${variantImages.length} from variants, ${JSON.parse(product.images || '[]').length} from product)`);

  // Parse tags to detect color variants
  let tags: string[] = [];
  try {
    if (typeof product.tags === 'string') {
      tags = JSON.parse(product.tags);
    } else if (Array.isArray(product.tags)) {
      tags = product.tags;
    }
  } catch {
    tags = [];
  }

  // Helper function to get color code
  const getColorCode = (colorName: string): string => {
    const colorMap: Record<string, string> = {
      svart: '#1f2937',
      hvit: '#f9fafb',
      grå: '#6b7280',
      rød: '#ef4444',
      blå: '#3b82f6',
      grønn: '#10b981',
      gul: '#fbbf24',
      rosa: '#ec4894',
      lilla: '#a855f7',
      oransje: '#f97316',
      brun: '#92400e',
      black: '#1f2937',
      white: '#f9fafb',
      gray: '#6b7280',
      grey: '#6b7280',
      red: '#ef4444',
      blue: '#3b82f6',
      green: '#10b981',
      yellow: '#fbbf24',
      pink: '#ec4899',
      purple: '#a855f7',
      orange: '#f97316',
      brown: '#92400e',
    };

    const normalized = colorName.toLowerCase().trim();
    for (const [key, code] of Object.entries(colorMap)) {
      if (normalized.includes(key)) {
        return code;
      }
    }
    return '#94a3b8';
  };

  // Helper function to find image by color name in URL or tags
  const findImageByColor = (color: string, availableImages: string[]): string | null => {
    const normalizedColor = color.toLowerCase().trim();
    
    // Try to find image URL that contains color name
    for (const img of availableImages) {
      const imgLower = img.toLowerCase();
      if (imgLower.includes(normalizedColor)) {
        return img;
      }
    }
    
    // Try matching with color variations
    const colorVariations: Record<string, string[]> = {
      'svart': ['black', 'svart'],
      'hvit': ['white', 'hvit'],
      'grå': ['gray', 'grey', 'grå', 'graa'],
      'rød': ['red', 'rød'],
      'blå': ['blue', 'blå'],
      'grønn': ['green', 'grønn', 'grønn'],
    };
    
    const variations = colorVariations[normalizedColor] || [normalizedColor];
    for (const variation of variations) {
      for (const img of availableImages) {
        if (img.toLowerCase().includes(variation)) {
          return img;
        }
      }
    }
    
    return null;
  };

  // Track used images to ensure uniqueness
  const usedImages = new Set<string>();
  
  // Map variants with proper images and color codes
  const variants: VariantDisplay[] = product.variants.map((v, index) => {
    const attrs = (v.attributes as Record<string, string>) || {};
    const color = attrs.color || attrs.farge || v.name.toLowerCase();
    const colorSlug = color.toLowerCase().replace(/\s+/g, '-');
    
    // CRITICAL: Prioritize variant's own image from database, but skip placeholders
    let variantImage = v.image || null;
    
    // Skip placeholder images from variant - they're not useful
    const isPlaceholder = variantImage && (
      variantImage.includes('placeholder') || 
      variantImage.includes('placehold.co') ||
      variantImage.includes('via.placeholder')
    );
    
    if (isPlaceholder) {
      variantImage = null;
    }
    
    // If no valid variant image, try to find one
    if (!variantImage) {
      // Try to find image by color name in URL
      variantImage = findImageByColor(color, images) || null;
      
      if (!variantImage) {
        // Fallback: try to match with tags to find correct image index
        const colorIndex = tags.findIndex((tag: string) => 
          tag.toLowerCase().includes(color.toLowerCase())
        );
        
        if (colorIndex >= 0 && images[colorIndex] && !images[colorIndex].includes('placehold')) {
          variantImage = images[colorIndex];
        } else if (images[index] && !images[index].includes('placehold')) {
          // Use index-based assignment (skip placeholders)
          variantImage = images[index];
        } else {
          // Find first non-placeholder image
          for (let i = 0; i < images.length; i++) {
            if (!images[i].includes('placehold')) {
              variantImage = images[i];
              break;
            }
          }
        }
      }
    }
    
    // Track used images for uniqueness (but allow duplicates if necessary)
    if (variantImage) {
      usedImages.add(variantImage);
    }
    
    return {
      id: v.id,
      name: v.name,
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
      image: variantImage,
      attributes: attrs,
      stock: v.stock,
      colorCode: getColorCode(color),
      slug: colorSlug,
    };
  });

  // Determine active variant from URL parameter
  const activeVariantSlug = variantParam || variants[0]?.slug;
  const activeVariant = variants.find((v) => v.slug === activeVariantSlug) || variants[0];

  // Reorder images to show active variant first
  // CRITICAL: Ensure variant image is included in images array
  let reorderedImages = [...images];
  if (activeVariant && activeVariant.image) {
    // Filter out placeholder/invalid images
    const validVariantImage = activeVariant.image && 
      activeVariant.image.startsWith('http') && 
      !activeVariant.image.includes('placeholder') &&
      !activeVariant.image.includes('placehold.co');
    
    if (validVariantImage) {
      const variantImageIndex = images.findIndex((img: string) => img === activeVariant.image);
      
      if (variantImageIndex > 0) {
        // Move variant's image to front
        reorderedImages = [
          activeVariant.image,
          ...images.filter((_: string, idx: number) => idx !== variantImageIndex)
        ];
      } else if (variantImageIndex === -1) {
        // If variant image is not in main images array, add it to front
        // This ensures the variant image is always available
        reorderedImages = [activeVariant.image, ...images.filter((img: string) => 
          img !== activeVariant.image && 
          img && 
          img.startsWith('http') &&
          !img.includes('placeholder')
        )];
      } else {
        // Variant image is already first, but ensure it's there
        if (reorderedImages[0] !== activeVariant.image) {
          reorderedImages = [
            activeVariant.image, 
            ...images.filter((img: string) => 
              img !== activeVariant.image && 
              img && 
              img.startsWith('http') &&
              !img.includes('placeholder')
            )
          ];
        }
      }
    } else {
      // Variant image is invalid, filter out placeholders from images
      reorderedImages = images.filter((img: string) => 
        img && 
        img.startsWith('http') &&
        !img.includes('placeholder') &&
        !img.includes('placehold.co')
      );
    }
  } else {
    // No active variant or no variant image, filter out placeholders
    reorderedImages = images.filter((img: string) => 
      img && 
      img.startsWith('http') &&
      !img.includes('placeholder') &&
      !img.includes('placehold.co')
    );
  }

  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPercent = hasDiscount && product.compareAtPrice
    ? Math.round((1 - product.price / product.compareAtPrice) * 100) 
    : 0;

  // Clean product name (decode URL-encoded characters)
  const cleanedName = cleanProductName(product.name);

  const productData = {
    id: product.id,
    name: cleanedName,
    slug: product.slug,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
    image: images[0] || 'https://placehold.co/600x600?text=Ingen+bilde',
  };

  return (
    <main className="min-h-screen bg-gray-light py-8">
      <div className="mx-auto max-w-7xl px-4">
        
        {/* Breadcrumbs */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand transition-colors">Hjem</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-brand transition-colors">Produkter</Link>
          <span>/</span>
          {product.category && (
            <>
              <Link href={`/products?category=${product.category}`} className="hover:text-brand transition-colors">
                {product.category}
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-dark">{cleanedName}</span>
        </nav>

        <ProductPageClientWrapper
          images={reorderedImages}
          productName={cleanedName}
          variants={variants}
          defaultImage={productData.image}
          activeVariantSlug={activeVariantSlug}
        >
          {/* Høyre - Produktinfo */}
          <div>
            <div className="rounded-xl bg-white p-6">
              {/* Badges */}
              <div className="mb-4 flex gap-2">
                {hasDiscount && (
                  <span className="rounded bg-sale px-3 py-1 text-sm font-bold text-white">
                    SPAR {discountPercent}%
                  </span>
                )}
                <span className="rounded bg-brand-light px-3 py-1 text-sm font-semibold text-brand">
                  På lager
                </span>
              </div>

              {/* Kategori */}
              <p className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-medium">
                {product.category}
              </p>

              {/* Tittel */}
              <h1 className="mb-4 text-2xl font-bold text-dark lg:text-3xl">
                {cleanedName}
              </h1>

              {/* Rating */}
              <div className="mb-4 flex items-center gap-2">
                <div className="flex text-brand">
                  {'★★★★★'.split('').map((_, i) => (
                    <span key={i} className={i < 4 ? 'text-brand' : 'text-gray-border'}>★</span>
                  ))}
                </div>
                <span className="text-sm text-gray-medium">(24 anmeldelser)</span>
              </div>

              {/* Pris */}
              <div className="mb-6 rounded-lg bg-gray-light p-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-dark">
                    {Math.floor(product.price).toLocaleString('no-NO')},-
                  </span>
                  {hasDiscount && (
                    <span className="text-xl text-gray-medium line-through">
                      {Math.floor(product.compareAtPrice!).toLocaleString('no-NO')},-
                    </span>
                  )}
                </div>
                {hasDiscount && (
                  <p className="mt-1 text-sm font-semibold text-sale">
                    Du sparer {Math.floor(product.compareAtPrice! - product.price).toLocaleString('no-NO')},-
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-medium">Inkl. mva</p>
              </div>

              {/* Kort beskrivelse */}
              <p className="mb-6 text-gray-medium">
                {product.shortDescription || product.description?.substring(0, 200)}
              </p>

              {/* Variant selector - vises før AddToCartButton */}
              {variants.length > 0 && (
                <div className="mb-6">
                  <Suspense fallback={<div className="h-20 w-full rounded-lg bg-gray-200 animate-pulse" />}>
                    <ProductVariantSelector
                      variants={variants}
                      defaultImage={productData.image}
                      variantTypeLabel="Farge"
                    />
                  </Suspense>
                </div>
              )}

              {/* Add to cart */}
              <AddToCartButton product={productData} variants={variants} />

              {/* USPs */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 rounded-lg border border-gray-border p-3">
                  <Truck className="text-brand" size={24} />
                  <div>
                    <p className="text-sm font-semibold text-dark">Fri frakt</p>
                    <p className="text-xs text-gray-medium">Over 500,-</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-gray-border p-3">
                  <RotateCcw className="text-brand" size={24} />
                  <div>
                    <p className="text-sm font-semibold text-dark">30 dagers</p>
                    <p className="text-xs text-gray-medium">Åpent kjøp</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-gray-border p-3">
                  <Shield className="text-brand" size={24} />
                  <div>
                    <p className="text-sm font-semibold text-dark">2 års garanti</p>
                    <p className="text-xs text-gray-medium">Full dekning</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-gray-border p-3">
                  <Check className="text-brand" size={24} />
                  <div>
                    <p className="text-sm font-semibold text-dark">På lager</p>
                    <p className="text-xs text-gray-medium">Sendes i dag</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ProductPageClientWrapper>

        {/* Tabs */}
        <ProductTabs 
          description={product.description || 'Ingen beskrivelse tilgjengelig.'} 
          specifications={{}}
        />

        {/* Relaterte produkter */}
        {relatedProducts.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-6 text-2xl font-bold text-dark">Relaterte produkter</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {relatedProducts.map((p) => {
                const pImages = typeof p.images === 'string' ? JSON.parse(p.images) : p.images || [];
                return (
                  <ProductCard 
                    key={p.id} 
                    product={{
                      id: p.id,
                      name: p.name,
                      slug: p.slug,
                      price: Number(p.price),
                      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
                      images: pImages,
                      category: p.category,
                    }} 
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
