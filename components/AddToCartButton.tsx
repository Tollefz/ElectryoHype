'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Minus, Plus, Check } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { useProductVariant } from '@/components/ProductPageClientWrapper';
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
}

export default function AddToCartButton({ product, variants = [] }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();
  const router = useRouter();
  const variantCtx = useProductVariant();

  const selectedVariant =
    variantCtx?.selectedVariant ||
    (variants.length > 0 ? variants[0] : null);

  const displayPrice = selectedVariant ? selectedVariant.price : product.price;
  const displayImage = selectedVariant?.image || product.image;

  const handleAddToCart = async () => {
    try {
      setIsLoading(true);
      setError(null);

      addToCart(
        {
          productId: product.id,
          name: product.name,
          price: displayPrice,
          image: displayImage || '',
          quantity: 1,
          slug: product.slug,
          variantId: selectedVariant?.id || undefined,
          variantName: selectedVariant?.name || undefined,
        },
        quantity
      );
      setAdded(true);
      toast.success(`${product.name} lagt i handlekurv!`);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      setError('Kunne ikke legge produkt i handlekurv. Prøv igjen.');
      console.error('Error adding to cart:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBuyNow = async () => {
    try {
      setIsLoading(true);
      setError(null);
      addToCart(
        {
          productId: product.id,
          name: product.name,
          price: displayPrice,
          image: displayImage || '',
          quantity: 1,
          slug: product.slug,
          variantId: selectedVariant?.id || undefined,
          variantName: selectedVariant?.name || undefined,
        },
        quantity
      );
      router.push('/checkout');
    } catch (err) {
      setError('Kunne ikke legge produkt i handlekurv. Prøv igjen.');
      console.error('Error adding to cart:', err);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[var(--text)]">Antall</span>
        <div className="flex items-center rounded-[var(--ehx-radius-sm)] border border-[var(--border-strong)]">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="px-3 py-2.5 transition hover:bg-[var(--surface-muted)]"
            aria-label="Reduser antall"
          >
            <Minus size={16} />
          </button>
          <span className="w-10 text-center font-semibold">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            className="px-3 py-2.5 transition hover:bg-[var(--surface-muted)]"
            aria-label="Øk antall"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--ehx-radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={added || isLoading}
        className="ehx-btn ehx-btn-primary w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-60 sm:py-4 sm:text-lg"
      >
        {isLoading ? (
          'Legger til…'
        ) : added ? (
          <>
            <Check size={20} />
            Lagt i handlekurv!
          </>
        ) : (
          <>
            <ShoppingCart size={20} />
            Legg i handlekurv
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleBuyNow}
        disabled={isLoading}
        className="ehx-btn ehx-btn-secondary w-full border-[var(--brand)] py-3.5 text-base text-[var(--brand-dark)] hover:bg-[var(--brand-soft)] disabled:opacity-50 sm:py-4 sm:text-lg"
      >
        {isLoading ? 'Legger til…' : 'Kjøp nå'}
      </button>
    </div>
  );
}
