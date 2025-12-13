'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Heart } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/lib/cart-context';
import { cleanProductName } from '@/lib/utils/url-decode';
import { getCategoryByDbValue } from '@/lib/categories';
import toast from 'react-hot-toast';

interface ProductCardProps {
  product: any;
}

function ProductCard({ product }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { addToCart } = useCart();

  // KRITISK: Parse images fra JSON string med error handling
  // Støtter både images (JSON array) og imageUrl (single string)
  let images: string[] = [];
  try {
    if (typeof product.images === 'string') {
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(product.images);
        images = Array.isArray(parsed) ? parsed : [];
      } catch {
        // If not valid JSON, treat as single URL string
        if (product.images && product.images.startsWith('http')) {
          images = [product.images];
        }
      }
    } else if (Array.isArray(product.images)) {
      images = product.images;
    }
  } catch (error) {
    images = [];
  }

  // Check for imageUrl field (if product has it)
  const imageUrl = (product as any).imageUrl;

  // Valider at bildene er gyldige URLs
  const isValidUrl = (url: string) => {
    if (!url || typeof url !== 'string') return false;
    try {
      new URL(url);
      return url.startsWith('http') && !url.includes('placehold.co');
    } catch {
      return false;
    }
  };

  // Filtrer ut ugyldige bilder og placeholders
  const validImages = images.filter(img => isValidUrl(img));
  
  // Prioritize: imageUrl > images[0] > fallback
  // Fallback hvis ingen bilder
  const fallbackImage = 'https://placehold.co/400x400/f5f5f5/666666?text=Produkt';
  const primaryImage = 
    (imageUrl && isValidUrl(imageUrl)) 
      ? imageUrl 
      : (validImages[0] || fallbackImage);
  const mainImage = primaryImage;
  const hoverImage = validImages[1] || mainImage; // Hvis ingen andre bilder, bruk samme
  
  // Clean product name (decode URL-encoded characters)
  const cleanedName = cleanProductName(product.name);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Parse images to get first image
    let image = '';
    try {
      const images = typeof product.images === 'string' 
        ? JSON.parse(product.images) 
        : product.images || [];
      image = images[0] || '';
    } catch {
      image = '';
    }
    
    const cartItem = {
      productId: product.id,
      name: cleanedName,
      price: product.price,
      image: image,
      quantity: 1,
      slug: product.slug,
      variantId: undefined,
      variantName: undefined,
    };
    
    addToCart(cartItem, 1);
    toast.success(`${cleanedName} lagt i handlekurv!`, {
      icon: '🛒',
    });
  };

  // Beregn rabatt
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPercent = hasDiscount 
    ? Math.round((1 - product.price / product.compareAtPrice) * 100) 
    : 0;

  return (
    <Link 
      href={`/products/${product.slug}`}
      className="group block h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-green-600 hover:shadow-md">
        
        {/* Badges */}
        {(hasDiscount || product.isNew) && (
          <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5 sm:left-3 sm:top-3">
            {hasDiscount && (
              <span className="rounded-md bg-red-500 px-2 py-1 text-xs font-bold text-white shadow-sm">
                -{discountPercent}%
              </span>
            )}
            {product.isNew && (
              <span className="rounded-md bg-green-500 px-2 py-1 text-xs font-bold text-white shadow-sm">
                NYHET
              </span>
            )}
          </div>
        )}

        {/* Wishlist button - kun på desktop */}
        <button 
          className="absolute right-2 top-2 z-10 hidden rounded-full bg-white p-2 opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:bg-gray-50 sm:right-3 sm:top-3 sm:block"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <Heart size={16} className="text-gray-600 hover:text-red-500" />
        </button>

        {/* Image container med hover-effekt */}
        <div className="relative aspect-square overflow-hidden bg-gray-50 group-hover:bg-gray-100 transition-colors duration-300">
          {/* Hovedbilde */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${
            isHovered && hoverImage !== mainImage ? 'opacity-0' : 'opacity-100'
          }`}>
            <Image
              src={imageError ? fallbackImage : mainImage}
              alt={cleanedName}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-3 sm:p-4"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          </div>
          
          {/* Hover-bilde (kun hvis forskjellig) */}
          {hoverImage !== mainImage && (
            <div className={`absolute inset-0 transition-opacity duration-300 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}>
              <Image
                src={hoverImage}
                alt={`${cleanedName} - alternativt bilde`}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-contain p-3 sm:p-4"
                loading="lazy"
                onError={() => {
                  // Hvis hover-bilde feiler, vis hovedbilde
                  setIsHovered(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          {/* Kategori */}
          <p className="mb-1 text-[11px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">
            {(() => {
              const categoryDef = getCategoryByDbValue(product.category);
              return categoryDef?.label || product.category || 'Elektronikk';
            })()}
          </p>

          {/* Produktnavn */}
          <h3 className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm sm:text-base font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
            {cleanedName}
          </h3>


          {/* Pris */}
          <div className="mb-3 sm:mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold text-gray-900">
                {Math.floor(product.price).toLocaleString('no-NO')},-
              </span>
            </div>
            {hasDiscount && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-400 line-through">
                  {Math.floor(product.compareAtPrice).toLocaleString('no-NO')},-
                </span>
                <span className="rounded-full bg-green-600 px-2 py-1 text-xs font-semibold text-white">
                  -{discountPercent}%
                </span>
              </div>
            )}
          </div>

          {/* Legg i handlekurv knapp */}
          <button
            onClick={handleAddToCart}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 sm:py-3 text-sm font-semibold text-white transition-all hover:bg-green-700 active:scale-[0.98] shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
          >
            <ShoppingCart size={16} />
            <span>Legg i handlekurv</span>
          </button>

          {/* Leveringsinfo - skjul på mobil */}
          <p className="mt-2 hidden text-center text-xs font-medium text-green-600 sm:block">
            ✓ Tilgjengelig – 5–12 virkedager
          </p>
        </div>
      </div>
    </Link>
  );
}

export default ProductCard;
export { ProductCard };
