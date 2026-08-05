'use client';

import { useState, useMemo, useEffect, useContext, useCallback } from 'react';
import Image from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { VariantContext, type ProductVariant } from './ProductPageClientWrapper';
import {
  getVariantDisplayLabel,
  getVariantTypeLabel,
} from '@/lib/products/variant-label';
import { shouldUnoptimizeRemoteImage } from '@/lib/utils/supplier-image';

interface ProductVariantSelectorProps {
  variants: ProductVariant[];
  defaultImage: string;
  productName: string;
  variantTypeLabel?: string;
}

export default function ProductVariantSelector({
  variants,
  defaultImage,
  productName,
  variantTypeLabel,
}: ProductVariantSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const variantContext = useContext(VariantContext);

  const setSelectedVariantImage = variantContext?.setSelectedVariantImage;
  const setSelectedVariant = variantContext?.setSelectedVariant;

  const urlVariantSlug = searchParams.get('variant');

  const resolveVariant = useCallback(
    (slug: string | null) => {
      if (slug) {
        const match = variants.find((v) => v.slug === slug);
        if (match) return match;
      }
      return variants[0] ?? null;
    },
    [variants]
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => resolveVariant(urlVariantSlug)?.id ?? null
  );

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || variants[0] || null,
    [variants, selectedVariantId]
  );

  const typeLabel = variantTypeLabel || getVariantTypeLabel(variants);

  const applyVariant = useCallback(
    (variant: ProductVariant, updateUrl: boolean) => {
      const variantImage = variant.image || defaultImage || null;
      setSelectedVariantImage?.(variantImage);
      setSelectedVariant?.(variant);

      if (!updateUrl || !variant.slug) return;
      const current = searchParams.get('variant');
      if (variant.slug === current) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', variant.slug);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [
      defaultImage,
      setSelectedVariantImage,
      setSelectedVariant,
      searchParams,
      router,
      pathname,
    ]
  );

  // Sync FROM URL only (back/forward / shared links) — never write URL here
  useEffect(() => {
    const fromUrl = resolveVariant(urlVariantSlug);
    if (!fromUrl) return;
    if (fromUrl.id === selectedVariantId) return;
    setSelectedVariantId(fromUrl.id);
    applyVariant(fromUrl, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL is the source of truth for this effect
  }, [urlVariantSlug]);

  // Initial context sync once we have a selection (no URL write if already matching)
  useEffect(() => {
    if (!selectedVariant) return;
    applyVariant(selectedVariant, selectedVariant.slug !== urlVariantSlug);
    // Run only on mount / when product variants identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);

  if (variants.length === 0) return null;

  const selectedLabel = selectedVariant
    ? getVariantDisplayLabel(selectedVariant, productName, variants)
    : null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-900">
        {typeLabel}
        {selectedLabel ? (
          <span className="font-normal text-gray-600">
            : {selectedLabel.line || selectedLabel.primary}
          </span>
        ) : null}
      </label>

      <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto overscroll-contain sm:max-h-[260px] pr-0.5">
        {variants.map((variant) => {
          const isSelected = selectedVariantId === variant.id;
          const thumb = variant.image || defaultImage;
          const label = getVariantDisplayLabel(variant, productName, variants);

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => {
                if (variant.id === selectedVariantId) return;
                setSelectedVariantId(variant.id);
                applyVariant(variant, true);
              }}
              className={`group flex w-full items-center gap-2 rounded border px-1.5 py-1 text-left transition-colors ${
                isSelected
                  ? 'border-green-600 bg-green-50 ring-1 ring-green-600/30'
                  : 'border-gray-200 bg-white hover:border-green-500 hover:bg-gray-50'
              }`}
              aria-pressed={isSelected}
              aria-label={`Velg ${label.primary}${label.secondary ? ` ${label.secondary}` : ''}`}
            >
              <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded bg-gray-50">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-contain p-0.5 transition-opacity duration-200"
                    unoptimized={shouldUnoptimizeRemoteImage(thumb)}
                  />
                ) : variant.colorCode ? (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: variant.colorCode }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                    —
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm leading-tight ${
                    isSelected ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'
                  }`}
                >
                  {label.primary}
                </p>
                {label.secondary ? (
                  <p className="truncate text-xs text-gray-500">{label.secondary}</p>
                ) : null}
              </div>

              {isSelected ? (
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Check size={12} />
                </span>
              ) : (
                <span className="h-5 w-5 flex-shrink-0 rounded-full border border-gray-300" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
