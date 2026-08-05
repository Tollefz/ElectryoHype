'use client';

import { useProductVariant } from '@/components/ProductPageClientWrapper';

interface ProductPriceProps {
  basePrice: number;
  baseCompareAt?: number | null;
}

export default function ProductPrice({ basePrice, baseCompareAt }: ProductPriceProps) {
  const ctx = useProductVariant();
  const price = ctx?.selectedVariant?.price ?? basePrice;
  const compareAt = ctx?.selectedVariant?.compareAtPrice ?? baseCompareAt ?? null;
  const hasDiscount = compareAt != null && compareAt > price;
  const discountPercent = hasDiscount
    ? Math.round((1 - price / compareAt!) * 100)
    : 0;
  const saved = hasDiscount ? Math.floor(compareAt! - price) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[1.75rem] font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">
          {Math.floor(price).toLocaleString('no-NO')},-
        </span>
        {hasDiscount ? (
          <span className="text-base text-[var(--text-muted)] line-through sm:text-lg">
            {Math.floor(compareAt!).toLocaleString('no-NO')},-
          </span>
        ) : null}
        {hasDiscount ? (
          <span className="rounded-md bg-[var(--danger)] px-2 py-0.5 text-xs font-extrabold text-white">
            −{discountPercent}%
          </span>
        ) : null}
      </div>
      {hasDiscount ? (
        <p className="text-sm font-medium text-[var(--danger)]">
          Du sparer {saved.toLocaleString('no-NO')},-
        </p>
      ) : null}
      <p className="text-xs text-[var(--text-muted)]">Inkl. mva</p>
    </div>
  );
}
