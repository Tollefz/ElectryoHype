'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShoppingCart, Minus, Plus, Check } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import toast from 'react-hot-toast';

interface Variant {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
  attributes: Record<string, string>;
  stock: number;
}

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    compareAtPrice?: number | null;
    image: string;
  };
  variants?: Variant[];
  onVariantChange?: (variant: Variant | null) => void;
}

export default function AddToCartButton({ product, variants = [], onVariantChange }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null
  );
  const [added, setAdded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();
  const router = useRouter();

  const hasVariants = variants.length > 0;
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || null,
    [variants, selectedVariantId]
  );

  // Notify parent when variant changes
  useEffect(() => {
    if (onVariantChange) {
      onVariantChange(selectedVariant);
    }
  }, [selectedVariant, onVariantChange]);

  const displayPrice = selectedVariant ? selectedVariant.price : product.price;
  const displayCompareAtPrice = selectedVariant
    ? selectedVariant.compareAtPrice
    : product.compareAtPrice;
  const displayImage = selectedVariant?.image || product.image;

  const handleAddToCart = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const itemToAdd = {
        productId: product.id,
        name: product.name,
        price: displayPrice,
        image: displayImage,
        quantity: 1, // Will be handled by addToCart
        slug: product.slug,
        variantId: selectedVariant?.id || undefined,
        variantName: selectedVariant?.name || undefined,
      };

      addToCart(itemToAdd, quantity);
      setAdded(true);
      toast.success(`${product.name} lagt i handlekurv!`, {
        icon: '🛒',
      });
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      setError('Kunne ikke legge produkt i handlekurv. Prøv igjen.');
      console.error('Error adding to cart:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Antall velger */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-dark">Antall:</span>
        <div className="flex items-center rounded-lg border border-gray-border">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="px-4 py-3 hover:bg-gray-light transition-colors"
          >
            <Minus size={16} />
          </button>
          <span className="w-12 text-center font-semibold">{quantity}</span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="px-4 py-3 hover:bg-gray-light transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Legg i handlekurv knapp */}
      <button
        onClick={handleAddToCart}
        disabled={added || isLoading}
        className={`flex w-full items-center justify-center gap-3 rounded-lg py-3 sm:py-4 text-base sm:text-lg font-semibold transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${
          added 
            ? 'bg-green-600 text-white' 
            : isLoading
            ? 'bg-green-600 text-white cursor-wait'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Legger til...
          </>
        ) : added ? (
          <>
            <Check size={20} className="sm:w-6 sm:h-6" />
            Lagt i handlekurv!
          </>
        ) : (
          <>
            <ShoppingCart size={20} className="sm:w-6 sm:h-6" />
            Legg i handlekurv
          </>
        )}
      </button>

      {/* Kjøp nå knapp */}
      <button
        onClick={async () => {
          try {
            setIsLoading(true);
            setError(null);
            
            const itemToAdd = {
              productId: product.id,
              name: product.name,
              price: displayPrice,
              image: displayImage,
              quantity: 1,
              slug: product.slug,
              variantId: selectedVariant?.id || undefined,
              variantName: selectedVariant?.name || undefined,
            };

            addToCart(itemToAdd, quantity);
            
            // Navigate to checkout immediately
            router.push('/checkout');
          } catch (err) {
            setError('Kunne ikke legge produkt i handlekurv. Prøv igjen.');
            console.error('Error adding to cart:', err);
            setIsLoading(false);
          }
        }}
        disabled={isLoading}
        className="w-full rounded-lg border-2 border-green-600 py-4 text-lg font-semibold text-green-600 hover:bg-green-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Legger til...' : 'Kjøp nå'}
      </button>
    </div>
  );
}
