"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";

type Props = {
  images: string[];
  videos?: string[];
  title?: string;
  open: boolean;
  initialIndex?: number;
  onClose: () => void;
};

/**
 * Inline supplier media gallery — no new page.
 */
export function BuyerImageGallery({
  images,
  videos = [],
  title,
  open,
  initialIndex = 0,
  onClose,
}: Props) {
  const media = [
    ...images.map((url) => ({ type: "image" as const, url })),
    ...videos.map((url) => ({ type: "video" as const, url })),
  ];
  const [idx, setIdx] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) {
      setIdx(Math.min(Math.max(0, initialIndex), Math.max(0, media.length - 1)));
      setZoom(1);
    }
  }, [open, initialIndex, media.length]);

  const prev = useCallback(() => {
    setIdx((i) => (media.length ? (i - 1 + media.length) % media.length : 0));
    setZoom(1);
  }, [media.length]);

  const next = useCallback(() => {
    setIdx((i) => (media.length ? (i + 1) % media.length : 0));
    setZoom(1);
  }, [media.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, prev, next]);

  if (!open || media.length === 0) return null;

  const current = media[idx] || media[0];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal
      aria-label="Produktgalleri"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <p className="truncate text-sm font-medium text-white">
            {title || "Bilder"} · {idx + 1}/{media.length}
            {current.type === "video" ? " · video" : ""}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg p-2 text-white/80 hover:bg-white/10"
              onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              aria-label="Zoom ut"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-white/80 hover:bg-white/10"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              aria-label="Zoom inn"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-white/80 hover:bg-white/10"
              onClick={onClose}
              aria-label="Lukk"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-[50vh] flex-1 items-center justify-center overflow-hidden p-4">
          {media.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                onClick={prev}
                aria-label="Forrige"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="absolute right-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                onClick={next}
                aria-label="Neste"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {current.type === "video" ? (
            <video
              src={current.url}
              controls
              className="max-h-[70vh] max-w-full rounded-lg"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt=""
              className="max-h-[70vh] max-w-full rounded-lg object-contain transition-transform"
              style={{ transform: `scale(${zoom})` }}
              draggable={false}
            />
          )}
        </div>

        {media.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
            {media.map((m, i) => (
              <button
                key={`${m.url}-${i}`}
                type="button"
                onClick={() => {
                  setIdx(i);
                  setZoom(1);
                }}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                  i === idx ? "border-emerald-400" : "border-transparent opacity-70"
                }`}
              >
                {m.type === "video" ? (
                  <span className="flex h-full items-center justify-center bg-slate-800 text-[10px] text-white">
                    Video
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
