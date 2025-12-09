'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { ShoppingCart, Minus, Plus, Check } from 'lucide-react';
import { useCart } from '@/lib/cart-context';

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
  const { addToCart } = useCart();

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

  const handleAddToCart = () => {
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
    setTimeout(() => setAdded(false), 2000);
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

      {/* Legg i handlekurv knapp */}
      <button
        onClick={handleAddToCart}
        disabled={added}
        className={`flex w-full items-center justify-center gap-3 rounded-lg py-4 text-lg font-semibold transition-all ${
          added 
            ? 'bg-brand text-white' 
            : 'bg-dark text-white hover:bg-dark-secondary'
        }`}
      >
        {added ? (
          <>
            <Check size={24} />
            Lagt i handlekurv!
          </>
        ) : (
          <>
            <ShoppingCart size={24} />
            Legg i handlekurv
          </>
        )}
      </button>

      {/* Kjøp nå knapp */}
      <button className="w-full rounded-lg border-2 border-brand py-4 text-lg font-semibold text-brand hover:bg-brand hover:text-white transition-colors">
        Kjøp nå
      </button>
    </div>
  );
}
