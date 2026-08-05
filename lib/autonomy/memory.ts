/**
 * Store Memory — long-term preference learning for autonomy.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { buildPreferenceModel } from "@/lib/intelligence/preferences";

export type StoreMemoryData = {
  id: string;
  likes: string[];
  dislikes: string[];
  priceBand: { min: number; max: number; sweetSpot: number } | null;
  favoriteCategories: string[];
  preferredSuppliers: string[];
  brandProfile: string | null;
  imageStyle: string | null;
  seoStyle: string | null;
  productStructure: string | null;
};

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}

export async function getOrCreateStoreMemory(
  storeId?: string | null
): Promise<StoreMemoryData> {
  const existing = storeId
    ? await prisma.storeMemory.findUnique({ where: { storeId } })
    : await prisma.storeMemory.findFirst({ orderBy: { updatedAt: "desc" } });

  if (existing) {
    return {
      id: existing.id,
      likes: asStringArray(existing.likes),
      dislikes: asStringArray(existing.dislikes),
      priceBand: (existing.priceBand as StoreMemoryData["priceBand"]) || null,
      favoriteCategories: asStringArray(existing.favoriteCategories),
      preferredSuppliers: asStringArray(existing.preferredSuppliers),
      brandProfile: (existing.brandProfile as string) || null,
      imageStyle: (existing.imageStyle as string) || null,
      seoStyle: (existing.seoStyle as string) || null,
      productStructure: (existing.productStructure as string) || null,
    };
  }

  const created = await prisma.storeMemory.create({
    data: {
      storeId: storeId || null,
      likes: [],
      dislikes: [],
      favoriteCategories: ["Gaming", "Mobil & Tilbehør", "Data & IT"],
      preferredSuppliers: [],
    },
  });

  return {
    id: created.id,
    likes: [],
    dislikes: [],
    priceBand: null,
    favoriteCategories: ["Gaming", "Mobil & Tilbehør", "Data & IT"],
    preferredSuppliers: [],
    brandProfile: null,
    imageStyle: null,
    seoStyle: null,
    productStructure: null,
  };
}

/** Refresh memory from preference model + recent decisions. */
export async function refreshStoreMemory(storeId?: string | null): Promise<StoreMemoryData> {
  const prefs = await buildPreferenceModel(storeId);
  const current = await getOrCreateStoreMemory(storeId);

  const likes = [...current.likes];
  const dislikes = [...current.dislikes];
  if (prefs.gaming > 0.55 && !likes.includes("gaming")) likes.push("gaming");
  if (prefs.premium > 0.55 && !likes.includes("premium")) likes.push("premium");
  if (prefs.manyImages > 0.55 && !likes.includes("many_images")) likes.push("many_images");
  if (prefs.accessories > 0.55 && !likes.includes("accessories")) likes.push("accessories");
  if (prefs.budget > 0.6 && !likes.includes("budget")) likes.push("budget");

  const favoriteCategories = [...current.favoriteCategories];
  if (prefs.gaming > 0.55 && !favoriteCategories.includes("Gaming")) {
    favoriteCategories.unshift("Gaming");
  }

  const brandProfile =
    prefs.knownBrands > 0.6
      ? "Prefererer kjente merker"
      : prefs.knownBrands < 0.4
        ? "Åpen for sterke no-name ved margin/bilder"
        : current.brandProfile || "Blandet merkeprofil";

  const imageStyle =
    prefs.manyImages > 0.55
      ? "Mange profesjonelle produktbilder"
      : current.imageStyle || "Standard bildekrav";

  const seoStyle = current.seoStyle || "Norske SEO-titler, konkrete søkeord";
  const productStructure =
    current.productStructure ||
    "Tittel + kort intro + fordeler + specs + pakkeinnhold";

  const priceBand =
    prefs.premium > 0.55
      ? { min: 199, max: 2499, sweetSpot: 499 }
      : prefs.budget > 0.55
        ? { min: 49, max: 799, sweetSpot: 199 }
        : current.priceBand || { min: 99, max: 1499, sweetSpot: 349 };

  const updated = await prisma.storeMemory.update({
    where: { id: current.id },
    data: {
      likes,
      dislikes,
      favoriteCategories: favoriteCategories.slice(0, 8),
      brandProfile,
      imageStyle,
      seoStyle,
      productStructure,
      priceBand,
    },
  });

  return {
    id: updated.id,
    likes: asStringArray(updated.likes),
    dislikes: asStringArray(updated.dislikes),
    priceBand: (updated.priceBand as StoreMemoryData["priceBand"]) || null,
    favoriteCategories: asStringArray(updated.favoriteCategories),
    preferredSuppliers: asStringArray(updated.preferredSuppliers),
    brandProfile: (updated.brandProfile as string) || null,
    imageStyle: (updated.imageStyle as string) || null,
    seoStyle: (updated.seoStyle as string) || null,
    productStructure: (updated.productStructure as string) || null,
  };
}

/** Score how well a candidate fits store memory (0–100). */
export function memoryFitScore(
  memory: StoreMemoryData,
  candidate: {
    title: string;
    categoryHint?: string | null;
    shelf?: string | null;
    retailNOK?: number | null;
    premiumPotential?: boolean;
  }
): { score: number; why: string[] } {
  let score = 50;
  const why: string[] = [];
  const text = `${candidate.title} ${candidate.categoryHint || ""} ${candidate.shelf || ""}`.toLowerCase();

  if (memory.likes.includes("gaming") && /gaming|spill|rgb/.test(text)) {
    score += 15;
    why.push("Passer husket gaming-preferanse");
  }
  if (memory.likes.includes("premium") && candidate.premiumPotential) {
    score += 10;
    why.push("Passer premium-preferanse");
  }
  if (
    candidate.categoryHint &&
    memory.favoriteCategories.some((c) =>
      candidate.categoryHint!.toLowerCase().includes(c.split("&")[0].trim().toLowerCase())
    )
  ) {
    score += 12;
    why.push(`Favorittkategori: ${candidate.categoryHint}`);
  }
  if (memory.priceBand && candidate.retailNOK != null) {
    const { min, max, sweetSpot } = memory.priceBand;
    if (candidate.retailNOK >= min && candidate.retailNOK <= max) {
      score += 8;
      why.push("Innenfor husket prisklasse");
      if (Math.abs(candidate.retailNOK - sweetSpot) < sweetSpot * 0.35) {
        score += 5;
        why.push("Nær sweet-spot pris");
      }
    } else {
      score -= 10;
      why.push("Utenfor husket prisklasse");
    }
  }
  for (const d of memory.dislikes) {
    if (d && text.includes(d.toLowerCase())) {
      score -= 20;
      why.push(`Treffer dislike: ${d}`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), why };
}
