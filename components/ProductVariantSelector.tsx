'use client';

import { useState, useMemo, useEffect, useContext, useRef } from 'react';
import Image from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { VariantContext } from './ProductPageClientWrapper';

interface Variant {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
  attributes: Record<string, string>;
  stock: number;
  slug?: string;
  colorCode?: string;
}

interface ProductVariantSelectorProps {
  variants: Variant[];
  defaultImage: string;
  onVariantChange?: (variant: Variant | null, variantImage: string | null) => void;
  variantTypeLabel?: string;
}

export default function ProductVariantSelector({ 
  variants, 
  defaultImage, 
  onVariantChange,
  variantTypeLabel = 'Farge'
}: ProductVariantSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Get initial variant from URL or default - also update when URL changes
  const initialVariantSlug = searchParams.get('variant');
  const initialVariant = initialVariantSlug 
    ? variants.find((v) => v.slug === initialVariantSlug) || variants[0]
    : variants[0];

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariant?.id || (variants.length > 0 ? variants[0].id : null)
  );
  
  // Track if user just clicked (to avoid URL sync overriding user selection)
  const userClickRef = useRef<{ variantId: string; timestamp: number } | null>(null);

  // Update selected variant when URL changes externally (user navigated or shared link)
  // But only if user didn't just click (to avoid overriding user selection)
  useEffect(() => {
    // Ignore URL changes if user just clicked within last 500ms
    const recentClick = userClickRef.current && (Date.now() - userClickRef.current.timestamp) < 500;
    if (recentClick && userClickRef.current?.variantId === selectedVariantId) {
      return; // User just clicked this variant, don't override
    }
    
    if (initialVariantSlug && initialVariant && initialVariant.id !== selectedVariantId) {
      // URL changed externally - sync with it
      setSelectedVariantId(initialVariant.id);
      console.log(`[VariantSelector] 📍 Synced with URL variant: ${initialVariantSlug}`);
    }
  }, [initialVariantSlug]); // Only react to URL slug changes, not internal state
  
  // Try to use context if available (when used within ProductPageVariantWrapper)
  const variantContext = useContext(VariantContext);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || null,
    [variants, selectedVariantId]
  );

  // Update variant image and URL when variant changes - BUT only if it's a real change
  useEffect(() => {
    if (!selectedVariant) return;
    
    // Check if this variant is already selected in URL to avoid loops
    const currentUrlVariant = searchParams.get('variant');
    if (selectedVariant.slug === currentUrlVariant) {
      // Already in sync, just update context
      const variantImage = selectedVariant.image || defaultImage || null;
      if (variantContext) {
        variantContext.setSelectedVariantImage(variantImage);
        variantContext.setSelectedVariant(selectedVariant);
      }
      return;
    }
    
    const variantImage = selectedVariant.image || defaultImage || null;
    
    // Update via context if available - THIS IS CRITICAL
    if (variantContext) {
      // Force immediate update - don't wait for React batching
      variantContext.setSelectedVariantImage(variantImage);
      variantContext.setSelectedVariant(selectedVariant);
    }
    
    // Update URL with variant parameter (only if different)
    if (selectedVariant.slug && selectedVariant.slug !== currentUrlVariant) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', selectedVariant.slug);
      // Use replace instead of push to avoid adding to history
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      console.log(`[VariantSelector] ✅ Updated URL to: ?variant=${selectedVariant.slug}`);
    }
    
    // Also call callback if provided (for backwards compatibility)
    if (onVariantChange) {
      onVariantChange(selectedVariant, variantImage);
    }
  }, [selectedVariant?.id, selectedVariant?.slug, defaultImage, variantContext, onVariantChange, router, pathname, searchParams]);

  // Grupper varianter etter attributt (farge, størrelse, etc)
  const variantGroups = useMemo(() => {
    const groups: Record<string, Variant[]> = {};
    variants.forEach((variant) => {
      const key = variant.attributes?.color || variant.attributes?.farge || variant.attributes?.størrelse || variant.name.split(' - ')[0];
      if (!groups[key]) groups[key] = [];
      groups[key].push(variant);
    });
    return groups;
  }, [variants]);

  if (variants.length === 0) return null;

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-dark">
        {variantTypeLabel}: {selectedVariant?.attributes?.color || selectedVariant?.attributes?.farge || selectedVariant?.name.split(' - ')[0] || selectedVariant?.name}
      </label>
      
      <div className="flex flex-wrap gap-3">
        {variants.map((variant) => {
          const isSelected = selectedVariantId === variant.id;
          // Prioritize variant's own image, fallback to default
          const variantImage = variant.image || defaultImage;
          const variantLabel = variant.attributes?.color || variant.attributes?.farge || variant.attributes?.størrelse || variant.name.split(' - ')[0] || variant.name;
          
          return (
            <button
              key={variant.id}
              onClick={(e) => {
                e.preventDefault();
                
                // Track user click to prevent URL sync from overriding
                userClickRef.current = { variantId: variant.id, timestamp: Date.now() };
                
                setSelectedVariantId(variant.id);
                
                // CRITICAL: Immediately update context when clicked to trigger image change
                // This must happen synchronously, not in useEffect
                if (variantContext) {
                  const variantImageToUse = variant.image || defaultImage || null;
                  // Force immediate synchronous update - this will trigger re-render
                  variantContext.setSelectedVariantImage(variantImageToUse);
                  variantContext.setSelectedVariant(variant);
                  console.log(`[VariantSelector] ✅ Clicked variant: ${variantLabel}`);
                  console.log(`[VariantSelector] Image: ${variantImageToUse?.substring(0, 80)}...`);
                }
              }}
              className={`group relative flex flex-col items-center rounded-lg border-2 overflow-hidden transition-all ${
                isSelected
                  ? 'border-brand ring-2 ring-brand/20 shadow-md'
                  : 'border-gray-border hover:border-brand hover:shadow-sm'
              }`}
              aria-label={`Velg ${variantLabel}`}
            >
              {/* Variant bilde - unikt for hver variant */}
              <div className="relative w-24 h-24 bg-gray-light">
                {variantImage ? (
                  <Image
                    src={variantImage}
                    alt={`${variantLabel} variant`}
                    fill
                    sizes="96px"
                    className="object-contain p-2"
                  />
                ) : variant.colorCode ? (
                  // Show color swatch if no image but has color code
                  <div 
                    className="w-full h-full"
                    style={{ backgroundColor: variant.colorCode }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                    Ingen bilde
                  </div>
                )}
              </div>
              
              {/* Variant navn */}
              <div className={`w-full px-2 py-1.5 text-xs font-medium text-center transition-colors ${
                isSelected ? 'bg-brand-light text-brand' : 'bg-white text-dark'
              }`}>
                {variantLabel}
              </div>
              
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand border-2 border-white flex items-center justify-center shadow-sm z-10">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

