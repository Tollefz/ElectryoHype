'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Heart } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/lib/cart-context';
import { cleanProductName } from '@/lib/utils/url-decode';

interface ProductCardProps {
  product: any;
}

function ProductCard({ product }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { addToCart } = useCart();

  // KRITISK: Parse images fra JSON string med error handling
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

  // Valider at bildene er gyldige URLs
  const isValidUrl = (url: string) => {
    if (!url || typeof url !== 'string') return false;
    try {
      new URL(url);
      return url.startsWith('http');
    } catch {
      return false;
    }
  };

  // Filtrer ut ugyldige bilder
  const validImages = images.filter(img => isValidUrl(img));
  
  // Fallback hvis ingen bilder
  const fallbackImage = 'https://placehold.co/400x400/f5f5f5/666666?text=Produkt';
  const mainImage = validImages[0] || fallbackImage;
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
  };

  // Beregn rabatt
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPercent = hasDiscount 
    ? Math.round((1 - product.price / product.compareAtPrice) * 100) 
    : 0;

  return (
    <Link 
      href={`/products/${product.slug}`}
      className="group block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative overflow-hidden rounded-lg border border-gray-border bg-white transition-all duration-200 hover:border-brand hover:shadow-lg">
        
        {/* Badges */}
        {(hasDiscount || product.isNew) && (
          <div className="absolute left-3 top-3 z-10 flex flex-col gap-1">
            {hasDiscount && (
              <span className="rounded bg-sale px-2 py-1 text-xs font-bold text-white">
                -{discountPercent}%
              </span>
            )}
            {product.isNew && (
              <span className="rounded bg-brand px-2 py-1 text-xs font-bold text-white">
                NYHET
              </span>
            )}
          </div>
        )}

        {/* Wishlist button */}
        <button 
          className="absolute right-3 top-3 z-10 rounded-full bg-white p-2 opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:bg-gray-light"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <Heart size={18} className="text-gray-medium hover:text-sale" />
        </button>

        {/* Image container med hover-effekt */}
        <div className="relative aspect-square overflow-hidden bg-gray-light">
          {/* Hovedbilde */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${
            isHovered && hoverImage !== mainImage ? 'opacity-0' : 'opacity-100'
          }`}>
            <Image
              src={imageError ? fallbackImage : mainImage}
              alt={cleanedName}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-contain p-4"
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
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                className="object-contain p-4"
                onError={() => {
                  // Hvis hover-bilde feiler, vis hovedbilde
                  setIsHovered(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Kategori */}
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-medium">
            {product.category || 'Elektronikk'}
          </p>

              {/* Produktnavn */}
              <h3 className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-medium text-dark group-hover:text-brand transition-colors">
                {cleanedName}
              </h3>

          {/* Rating (placeholder) */}
          <div className="mb-3 flex items-center gap-1">
            <div className="flex text-brand">
              {'★★★★★'.split('').map((star, i) => (
                <span key={i} className={i < 4 ? 'text-brand' : 'text-gray-border'}>
                  ★
                </span>
              ))}
            </div>
            <span className="text-xs text-gray-medium">(24)</span>
          </div>

          {/* Pris */}
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-dark">
                {Math.floor(product.price).toLocaleString('no-NO')},-
              </span>
            </div>
            {hasDiscount && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-medium line-through">
                  {Math.floor(product.compareAtPrice).toLocaleString('no-NO')},-
                </span>
                <span className="text-sm font-semibold text-sale">
                  Spar {Math.floor(product.compareAtPrice - product.price).toLocaleString('no-NO')},-
                </span>
              </div>
            )}
          </div>

          {/* Legg i handlekurv knapp */}
          <button
            onClick={handleAddToCart}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            <ShoppingCart size={18} />
            Legg i handlekurv
          </button>

          {/* Leveringsinfo */}
          <p className="mt-3 text-center text-xs text-brand">
            ✓ På lager - Sendes i dag
          </p>
        </div>
      </div>
    </Link>
  );
}

export default ProductCard;
export { ProductCard };
