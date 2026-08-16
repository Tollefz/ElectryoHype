"use client";

import Image from "next/image";
import { useState } from "react";

type ProductCardMediaProps = {
  mainImage: string;
  alt: string;
};

/**
 * Mobile-first media: single lazy image, no hover swap.
 * Hover doubles decode/network on desktop and never helps on touch.
 */
export function ProductCardMedia({ mainImage, alt }: ProductCardMediaProps) {
  const [imageError, setImageError] = useState(false);

  if (!mainImage || imageError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          Bilde mangler
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          Produktet er fortsatt tilgjengelig
        </span>
      </div>
    );
  }

  return (
    <Image
      src={mainImage}
      alt={alt}
      fill
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 22vw"
      className="object-contain p-2.5 sm:p-3"
      loading="lazy"
      quality={65}
      onError={() => setImageError(true)}
    />
  );
}
