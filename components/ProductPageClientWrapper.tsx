'use client';

import { useState, createContext, useContext, ReactNode, useEffect, useMemo } from 'react';
import ProductImageGallery from './ProductImageGallery';
import ProductVariantSelector from './ProductVariantSelector';

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

// Context for sharing selected variant image between components
const VariantContext = createContext<{
  selectedVariantImage: string | null;
  selectedVariant: Variant | null;
  setSelectedVariantImage: (image: string | null) => void;
  setSelectedVariant: (variant: Variant | null) => void;
} | null>(null);

export const useVariantImage = () => {
  const context = useContext(VariantContext);
  return context; // Returns null if not in provider, which is OK
};

interface ProductPageClientWrapperProps {
  images: string[];
  productName: string;
  variants: Variant[];
  defaultImage: string;
  activeVariantSlug?: string;
  children: ReactNode;
}

export default function ProductPageClientWrapper({
  images,
  productName,
  variants,
  defaultImage,
  activeVariantSlug,
  children,
}: ProductPageClientWrapperProps) {
  // Find active variant from slug
  const getInitialVariant = () => {
    if (activeVariantSlug) {
      return variants.find((v: Variant) => v.slug === activeVariantSlug) || variants[0] || null;
    }
    return variants[0] || null;
  };

  const initialVariant = getInitialVariant();

  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(initialVariant);
  const [selectedVariantImage, setSelectedVariantImage] = useState<string | null>(
    initialVariant?.image || defaultImage || null
  );

  // Update image when selectedVariant changes (from user click OR context update)
  useEffect(() => {
    if (selectedVariant) {
      const newImage = selectedVariant.image || defaultImage || null;
      if (newImage !== selectedVariantImage) {
        setSelectedVariantImage(newImage);
        console.log(`[ProductPageClientWrapper] ✅ Variant image updated: ${selectedVariant.name} -> ${newImage?.substring(0, 60)}...`);
      }
    }
  }, [selectedVariant?.id, selectedVariant?.image, defaultImage]); // Only react to variant selection changes
  
  // Sync with URL on mount or when URL changes externally (but don't override active selection)
  useEffect(() => {
    if (activeVariantSlug) {
      const variantFromSlug = variants.find((v: Variant) => v.slug === activeVariantSlug);
      // Only sync if variant is different AND we don't have an active selection
      if (variantFromSlug && variantFromSlug.id !== selectedVariant?.id) {
        // Only update if URL variant is actually different (avoid loops)
        const newImage = variantFromSlug.image || defaultImage || null;
        setSelectedVariant(variantFromSlug);
        setSelectedVariantImage(newImage);
        console.log(`[ProductPageClientWrapper] ✅ Synced with URL variant: ${activeVariantSlug}`);
      }
    }
  }, [activeVariantSlug]); // Only react to external URL changes

  // Determine which images to show - prioritize variant image
  // CRITICAL: This must recalculate when selectedVariantImage changes
  const displayImages = useMemo(() => {
    // Filter out invalid/placeholder images
    const validImages = images.filter(img => 
      img && 
      typeof img === 'string' && 
      img.length > 0 && 
      img.startsWith('http') &&
      !img.includes('placeholder') &&
      !img.includes('placehold.co')
    );
    
    console.log(`[ProductPageClientWrapper] 🔄 Recalculating displayImages`);
    console.log(`  Variant image: ${selectedVariantImage?.substring(0, 60)}...`);
    console.log(`  Valid images count: ${validImages.length}`);
    
    // If no valid images at all, return empty array (will show placeholder)
    if (validImages.length === 0) {
      console.log(`[ProductPageClientWrapper] ⚠️ No valid images found`);
      return selectedVariantImage && selectedVariantImage.startsWith('http') && !selectedVariantImage.includes('placeholder')
        ? [selectedVariantImage]
        : [];
    }
    
    // If no variant image or variant image is invalid, return valid images as-is
    if (!selectedVariantImage || !selectedVariantImage.startsWith('http') || selectedVariantImage.includes('placeholder')) {
      console.log(`[ProductPageClientWrapper] No valid variant image, returning valid images`);
      return validImages;
    }

    // If variant image exists in images array, move it to front
    const variantImageIndex = validImages.findIndex(img => img === selectedVariantImage);
    console.log(`[ProductPageClientWrapper] Variant image index in array: ${variantImageIndex}`);
    
    if (variantImageIndex > 0) {
      // Move variant image to front
      const reordered = [
        selectedVariantImage,
        ...validImages.filter((img, idx) => idx !== variantImageIndex)
      ];
      console.log(`[ProductPageClientWrapper] ✅ Moved variant image to front, new first: ${reordered[0]?.substring(0, 60)}...`);
      return reordered;
    } else if (variantImageIndex === -1) {
      // Variant image not in images array, add it to front
      const withVariant = [selectedVariantImage, ...validImages];
      console.log(`[ProductPageClientWrapper] ✅ Added variant image to front, new first: ${withVariant[0]?.substring(0, 60)}...`);
      return withVariant;
    } else {
      // Variant image is already first
      console.log(`[ProductPageClientWrapper] ✅ Variant image already first`);
      return validImages;
    }
  }, [selectedVariantImage, JSON.stringify(images)]); // Recalculate when variant image or images change

  return (
    <VariantContext.Provider value={{ 
      selectedVariantImage, 
      selectedVariant,
      setSelectedVariantImage, 
      setSelectedVariant 
    }}>
      <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2">
        {/* Venstre - Bilder */}
        <div className="rounded-lg sm:rounded-xl bg-white p-3 sm:p-4 lg:p-6 order-1 lg:order-1">
          <ProductImageGallery 
            images={displayImages} 
            productName={productName}
            variantImage={selectedVariantImage || null}
          />
        </div>

        {/* Høyre - Produktinfo (children kan inneholde variant selector) */}
        <div className="order-2 lg:order-2">
          {children}
        </div>
      </div>
    </VariantContext.Provider>
  );
}

// Export context for use in ProductVariantSelector
export { VariantContext };

