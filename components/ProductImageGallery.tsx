'use client';

import Image from 'next/image';
import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, X } from 'lucide-react';
import { shouldUnoptimizeRemoteImage } from '@/lib/utils/supplier-image';

interface ProductImageGalleryProps {
  images: string[] | string;
  productName: string;
  variantImage?: string | null;
}

export default function ProductImageGallery({ images, productName, variantImage }: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  const imagesKey = typeof images === 'string' ? images : JSON.stringify(images);

  // Parse images and combine with variant image
  // CRITICAL: This must recalculate when variantImage or images change
  const allImages = useMemo(() => {
    let parsedImages: string[] = [];
    try {
      const parsed = JSON.parse(imagesKey);
      parsedImages = Array.isArray(parsed) ? parsed : [];
    } catch {
      parsedImages = [];
    }

    if (variantImage) {
      if (!parsedImages.includes(variantImage)) {
        return [variantImage, ...parsedImages];
      }
      const variantIndex = parsedImages.indexOf(variantImage);
      return [
        variantImage,
        ...parsedImages.filter((_, idx) => idx !== variantIndex),
      ];
    }
    return parsedImages;
  }, [variantImage, imagesKey]);

  const validImages = allImages.length > 0 
    ? allImages 
    : ['https://placehold.co/600x600/f5f5f5/666666?text=Produkt'];

  useEffect(() => {
    if (variantImage && allImages.length > 0) {
      const variantIndex = allImages.indexOf(variantImage);
      if (variantIndex !== -1 && variantIndex >= 0) {
        setActiveIndex(variantIndex);
      } else if (allImages.length > 0) {
        setActiveIndex(0);
      }
    } else if (!variantImage && allImages.length > 0) {
      setActiveIndex(0);
    }
  }, [variantImage, allImages]);

  const goToPrevious = () => {
    setActiveIndex((prev) => (prev === 0 ? validImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setActiveIndex((prev) => (prev === validImages.length - 1 ? 0 : prev + 1));
  };

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
    
    // If this is a generated/modified URL that doesn't exist, try to find the original base image
    const failedUrl = validImages[index];
    if (failedUrl && (failedUrl.includes('0001') || failedUrl.includes('0002') || failedUrl.includes('0003') || failedUrl.includes('0004'))) {
      // This looks like a generated URL - try to find the original
      const baseUrl = failedUrl.replace(/000[1-9]\.jpg/, '.jpg').replace(/000[1-9]\.jpeg/, '.jpeg');
      const baseIndex = validImages.findIndex(img => img === baseUrl || img.includes(baseUrl.split('/').pop()?.split('.')[0] || ''));
      
      if (baseIndex >= 0 && baseIndex !== index) {
        // Found original, switch to it
        setActiveIndex(baseIndex);
        return;
      }
    }
    
    // Try to move to next valid image
    if (validImages.length > 1) {
      const nextIndex = (index + 1) % validImages.length;
      if (!imageErrors.has(nextIndex)) {
        setActiveIndex(nextIndex);
      } else {
        // If next also has error, try to find first non-error image
        for (let i = 0; i < validImages.length; i++) {
          if (!imageErrors.has(i)) {
            setActiveIndex(i);
            break;
          }
        }
      }
    }
  };

  const currentImage = validImages[activeIndex];
  const hasError = imageErrors.has(activeIndex);

  return (
    <div>
      {/* Hovedbilde */}
      <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gray-50 transition-colors">
        {currentImage && !hasError ? (
          <Image
            src={currentImage}
            alt={`${productName} - Bilde ${activeIndex + 1}`}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain p-3 transition-opacity duration-300 sm:p-4"
            onError={() => handleImageError(activeIndex)}
            unoptimized={shouldUnoptimizeRemoteImage(currentImage)}
            priority={activeIndex === 0}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-gray-200">
            <div className="text-center p-4">
              <p className="text-gray-500 text-sm mb-2">Bilde kunne ikke lastes</p>
              {validImages.length > 1 && (
                <>
                  <button
                    onClick={goToNext}
                    className="text-blue-600 hover:text-blue-700 text-sm underline mr-2"
                  >
                    Prøv neste bilde
                  </button>
                  {/* Try to find and use the base/original image */}
                  {(() => {
                    const baseImage = validImages.find(img => 
                      !img.includes('0001') && 
                      !img.includes('0002') && 
                      !img.includes('0003') &&
                      !img.includes('_v1') &&
                      !img.includes('_v2')
                    );
                    if (baseImage && baseImage !== currentImage) {
                      const baseIndex = validImages.indexOf(baseImage);
                      return (
                        <button
                          onClick={() => {
                            setImageErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(baseIndex);
                              return newSet;
                            });
                            setActiveIndex(baseIndex);
                          }}
                          className="text-blue-600 hover:text-blue-700 text-sm underline"
                        >
                          Bruk originalt bilde
                        </button>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Navigasjonspiler */}
        {validImages.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-md hover:bg-gray-light transition-colors z-10"
              aria-label="Forrige bilde"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-md hover:bg-gray-light transition-colors z-10"
              aria-label="Neste bilde"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {/* Zoom/Fullscreen knapp */}
        <button 
          className="absolute right-4 top-4 rounded-full bg-white p-2 shadow-md hover:bg-gray-light z-10"
          onClick={() => setShowFullscreen(true)}
          aria-label="Vis fullskjerm"
        >
          <ZoomIn size={20} />
        </button>

        {/* Bildenummer */}
        {validImages.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
            {activeIndex + 1} / {validImages.length}
          </div>
        )}
      </div>

      {/* Miniatyrbilder */}
      {validImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {validImages.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                setImageErrors(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(index);
                  return newSet;
                });
                setActiveIndex(index);
              }}
              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all duration-200 sm:h-20 sm:w-20 ${
                index === activeIndex 
                  ? 'border-green-600 ring-2 ring-green-600/20' 
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              {!imageErrors.has(index) ? (
                <Image
                  src={image}
                  alt={`${productName} - Miniatyr ${index + 1}`}
                  fill
                  sizes="80px"
                  className="object-contain p-1"
                  onError={() => {
                    setImageErrors(prev => new Set(prev).add(index));
                  }}
                  unoptimized={shouldUnoptimizeRemoteImage(image)}
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <span className="text-xs text-gray-400">Feil</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setShowFullscreen(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFullscreen(false);
            }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 z-10"
            aria-label="Lukk fullskjerm"
          >
            <X size={24} />
          </button>
          <div 
            className="relative h-[80vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={validImages[activeIndex]}
              alt={productName}
              fill
              className="object-contain"
              sizes="100vw"
            />
            {validImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPrevious();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 z-10"
                  aria-label="Forrige bilde"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNext();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 z-10"
                  aria-label="Neste bilde"
                >
                  <ChevronRight size={24} />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-white">
                  {activeIndex + 1} / {validImages.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
