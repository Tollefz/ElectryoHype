"use client";

import Image from "next/image";
import { useState } from "react";

interface ImageGalleryProps {
  images: string[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [active, setActive] = useState(0);
  const display = images.length ? images : ["https://placehold.co/600x600?text=Ingen+bilde"];

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-100">
        <Image
          src={display[active]}
          alt="Produktbilde"
          fill
          sizes="(max-width: 768px) 100vw, 600px"
          className="object-cover transition duration-500 hover:scale-105"
          priority
        />
      </div>
      <div className="flex gap-3">
        {display.slice(0, 5).map((image, index) => (
          <button
            key={image + index}
            onClick={() => setActive(index)}
            className={`relative h-20 w-20 overflow-hidden rounded-xl border ${
              active === index ? "border-primary" : "border-transparent"
            }`}
          >
            <Image src={image} alt="mini" fill className="object-cover" sizes="80px" />
          </button>
        ))}
      </div>
    </div>
  );
}

