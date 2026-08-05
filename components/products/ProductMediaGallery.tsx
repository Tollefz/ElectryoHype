'use client';

/**
 * Product videos — only render playable HTML5 sources.
 * Failed / empty videos are removed (no black boxes).
 */

import { useState } from 'react';

interface ProductMediaGalleryProps {
  videos: Array<{ url: string; name?: string; type?: string }>;
  productName: string;
}

export default function ProductMediaGallery({
  videos,
  productName,
}: ProductMediaGalleryProps) {
  const playable = videos.filter(
    (v) => typeof v.url === 'string' && v.url.startsWith('http')
  );
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);

  const visible = playable.filter((_, i) => !hidden.has(i));
  if (!visible.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Video ({visible.length})
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {playable.map((video, i) => {
          if (hidden.has(i)) return null;
          const isOpen = active === i;
          return (
            <div
              key={`${video.url}-${i}`}
              className="relative h-36 w-56 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
            >
              {!isOpen ? (
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-800/90 text-white"
                  aria-label={`Spill ${video.name || `video ${i + 1}`}`}
                >
                  <span className="text-3xl" aria-hidden>
                    ▶
                  </span>
                  <span className="px-2 text-center text-[11px] opacity-90">
                    {video.name || `Video ${i + 1}`}
                  </span>
                </button>
              ) : (
                <video
                  src={video.url}
                  controls
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="metadata"
                  poster=""
                  className="h-full w-full object-contain bg-black"
                  aria-label={video.name || `${productName} video ${i + 1}`}
                  onError={() => {
                    setHidden((prev) => new Set(prev).add(i));
                    setActive(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
