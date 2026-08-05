'use client';

import {
  useState,
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import ProductImageGallery from './ProductImageGallery';

export interface ProductVariant {
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

type VariantContextValue = {
  selectedVariantImage: string | null;
  selectedVariant: ProductVariant | null;
  setSelectedVariantImage: (image: string | null) => void;
  setSelectedVariant: (variant: ProductVariant | null) => void;
};

const VariantContext = createContext<VariantContextValue | null>(null);

export function useProductVariant() {
  return useContext(VariantContext);
}

/** @deprecated Prefer useProductVariant */
export function useVariantImage() {
  return useContext(VariantContext);
}

interface ProductPageClientWrapperProps {
  images: string[];
  productName: string;
  variants: ProductVariant[];
  defaultImage: string;
  activeVariantSlug?: string;
  children: ReactNode;
  /** Rendered under the gallery so description starts higher (not below tall buy box) */
  belowGallery?: ReactNode;
  /** Optional media (video / 360) under the image gallery */
  galleryExtra?: ReactNode;
  videoCount?: number;
  /** Mobile sticky buy bar — must render inside variant context */
  stickyBuy?: ReactNode;
}

export default function ProductPageClientWrapper({
  images,
  productName,
  variants,
  defaultImage,
  activeVariantSlug,
  children,
  belowGallery,
  galleryExtra,
  videoCount = 0,
  stickyBuy,
}: ProductPageClientWrapperProps) {
  const initialVariant = useMemo(() => {
    if (activeVariantSlug) {
      return variants.find((v) => v.slug === activeVariantSlug) || variants[0] || null;
    }
    return variants[0] || null;
  }, [activeVariantSlug, variants]);

  const [selectedVariant, setSelectedVariantState] = useState<ProductVariant | null>(
    initialVariant
  );
  const [selectedVariantImage, setSelectedVariantImageState] = useState<string | null>(
    initialVariant?.image || defaultImage || null
  );

  const setSelectedVariantImage = useCallback((image: string | null) => {
    setSelectedVariantImageState((prev) => (prev === image ? prev : image));
  }, []);

  const setSelectedVariant = useCallback((variant: ProductVariant | null) => {
    setSelectedVariantState((prev) => {
      if (prev?.id === variant?.id) return prev;
      return variant;
    });
  }, []);

  useEffect(() => {
    if (!selectedVariant) return;
    const next = selectedVariant.image || defaultImage || null;
    setSelectedVariantImageState((prev) => (prev === next ? prev : next));
  }, [selectedVariant, defaultImage]);

  useEffect(() => {
    if (!activeVariantSlug) return;
    const fromSlug = variants.find((v) => v.slug === activeVariantSlug);
    if (!fromSlug) return;
    setSelectedVariantState((prev) => (prev?.id === fromSlug.id ? prev : fromSlug));
  }, [activeVariantSlug, variants]);

  const imagesKey = JSON.stringify(images);

  const displayImages = useMemo(() => {
    let parsedImages: string[] = [];
    try {
      const parsed = JSON.parse(imagesKey);
      parsedImages = Array.isArray(parsed) ? parsed : [];
    } catch {
      parsedImages = [];
    }

    const validImages = parsedImages.filter(
      (img) =>
        img &&
        typeof img === 'string' &&
        img.length > 0 &&
        img.startsWith('http') &&
        !img.includes('placeholder') &&
        !img.includes('placehold.co')
    );

    if (validImages.length === 0) {
      return selectedVariantImage &&
        selectedVariantImage.startsWith('http') &&
        !selectedVariantImage.includes('placeholder')
        ? [selectedVariantImage]
        : [];
    }

    if (
      !selectedVariantImage ||
      !selectedVariantImage.startsWith('http') ||
      selectedVariantImage.includes('placeholder')
    ) {
      return validImages;
    }

    const idx = validImages.findIndex((img) => img === selectedVariantImage);
    if (idx > 0) {
      return [selectedVariantImage, ...validImages.filter((_, i) => i !== idx)];
    }
    if (idx === -1) {
      return [selectedVariantImage, ...validImages];
    }
    return validImages;
  }, [selectedVariantImage, imagesKey]);

  const contextValue = useMemo<VariantContextValue>(
    () => ({
      selectedVariantImage,
      selectedVariant,
      setSelectedVariantImage,
      setSelectedVariant,
    }),
    [selectedVariantImage, selectedVariant, setSelectedVariantImage, setSelectedVariant]
  );

  const [mediaTab, setMediaTab] = useState<"images" | "video">("images");
  const hasVideos = videoCount > 0 && Boolean(galleryExtra);

  return (
    <VariantContext.Provider value={contextValue}>
      <div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="order-1 flex min-w-0 flex-col gap-5 sm:gap-6">
          <div className="rounded-lg bg-white p-3 sm:rounded-xl sm:p-4 lg:p-5">
            {hasVideos ? (
              <div className="mb-3 flex gap-2 border-b border-slate-100 pb-2">
                <button
                  type="button"
                  onClick={() => setMediaTab("images")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    mediaTab === "images"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Bilder ({displayImages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMediaTab("video")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    mediaTab === "video"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Video ({videoCount})
                </button>
              </div>
            ) : null}
            {mediaTab === "images" || !hasVideos ? (
              <ProductImageGallery
                images={displayImages}
                productName={productName}
                variantImage={selectedVariantImage || null}
              />
            ) : null}
            {hasVideos && mediaTab === "video" ? galleryExtra : null}
            {!hasVideos ? galleryExtra : null}
          </div>
          {belowGallery ? <div className="min-w-0">{belowGallery}</div> : null}
        </div>
        <div className="order-2 min-w-0 lg:sticky lg:top-24">{children}</div>
      </div>
      {stickyBuy}
    </VariantContext.Provider>
  );
}

export { VariantContext };
