"use client";

import { useState } from "react";

/**
 * Admin thumbnail that never crashes the product table.
 * next/image throws on unconfigured hostnames and can wipe the whole list UI.
 */
export default function SafeProductThumb({
  src,
  alt = "",
}: {
  src?: string | null;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const usable = !!src && src.startsWith("http") && !failed;

  if (!usable) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-[10px] text-gray-400">
        —
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
