/**
 * Human-readable Store Memory preferences with star ratings.
 */

import type { StoreMemoryData } from "@/lib/autonomy/memory";

export type MemoryStar = {
  id: string;
  label: string;
  stars: number; // 1–5
  kind: "like" | "dislike" | "neutral";
};

const LIKE_LABELS: Record<string, string> = {
  gaming: "Gaming",
  premium: "Premium",
  rgb: "RGB",
  many_images: "Mange bilder",
  accessories: "Tilbehør",
  budget: "Budsjett",
  known_brands: "Kjente merkevarer",
  short_delivery: "Kort levering",
  norsk_seo: "Norsk SEO",
};

const DISLIKE_LABELS: Record<string, string> = {
  cheap_plastic: "Billig plast",
  low_images: "Få bilder",
  long_delivery: "Lang levering",
};

function starsFromStrength(strength: number): number {
  if (strength >= 0.9) return 5;
  if (strength >= 0.75) return 4;
  if (strength >= 0.55) return 3;
  if (strength >= 0.35) return 2;
  return 1;
}

export function buildMemoryStars(
  memory: StoreMemoryData | null | undefined
): MemoryStar[] {
  const m = memory || {
    id: "",
    likes: [] as string[],
    dislikes: [] as string[],
    priceBand: null,
    favoriteCategories: [] as string[],
    preferredSuppliers: [] as string[],
    brandProfile: null,
    imageStyle: null,
    seoStyle: null,
    productStructure: null,
  };

  const out: MemoryStar[] = [];

  for (const cat of m.favoriteCategories || []) {
    out.push({
      id: `cat-${cat}`,
      label: cat,
      stars: 5,
      kind: "like",
    });
  }

  (m.likes || []).forEach((like, i) => {
    const label = LIKE_LABELS[like] || like.replace(/_/g, " ");
    if (out.some((o) => o.label.toLowerCase() === label.toLowerCase())) return;
    out.push({
      id: `like-${like}-${i}`,
      label,
      stars: starsFromStrength(0.85 - i * 0.05),
      kind: "like",
    });
  });

  if (m.imageStyle && /mange|profesjonell/i.test(m.imageStyle)) {
    out.push({ id: "images", label: "Mange bilder", stars: 5, kind: "like" });
  }
  if (m.seoStyle && /norsk/i.test(m.seoStyle)) {
    out.push({ id: "seo", label: "Norsk SEO", stars: 5, kind: "like" });
  }
  if (m.brandProfile && /kjente/i.test(m.brandProfile)) {
    out.push({ id: "brands", label: "Kjente merkevarer", stars: 4, kind: "like" });
  }

  (m.dislikes || []).forEach((d, i) => {
    out.push({
      id: `dislike-${d}-${i}`,
      label: DISLIKE_LABELS[d] || d.replace(/_/g, " "),
      stars: 2,
      kind: "dislike",
    });
  });

  // Sensible defaults so memory never feels empty
  if (out.length === 0) {
    return [
      { id: "d1", label: "Gaming", stars: 5, kind: "like" },
      { id: "d2", label: "Premium", stars: 4, kind: "like" },
      { id: "d3", label: "Mange bilder", stars: 5, kind: "like" },
      { id: "d4", label: "Norsk SEO", stars: 5, kind: "like" },
      { id: "d5", label: "Kort levering", stars: 4, kind: "like" },
      { id: "d6", label: "Billig plast", stars: 2, kind: "dislike" },
    ];
  }

  // Dedupe by label
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = s.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
}

export function formatStars(n: number): string {
  const filled = Math.max(1, Math.min(5, Math.round(n)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}
