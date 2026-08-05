/**
 * Seed queries per shelf — used by scanner across all providers.
 */

import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser/types";
import type { ShopProfileData } from "@/lib/suppliers/merchandiser/types";
import type { SupplierSortBy } from "@/lib/suppliers/provider";

export type ScanSeed = {
  shelf: MerchandiserShelf;
  query: string;
  sortBy: SupplierSortBy;
};

export function buildScanSeeds(
  profile: ShopProfileData,
  shelves?: MerchandiserShelf[]
): ScanSeed[] {
  const want = new Set(
    shelves?.length
      ? shelves
      : (["today", "gaming", "mobil", "kontor", "hjem", "elektronikk", "trending", "new"] as MerchandiserShelf[])
  );

  const seeds: ScanSeed[] = [];

  if (want.has("today")) {
    seeds.push(
      { shelf: "today", query: "Gaming Mouse", sortBy: "bestsellers" },
      { shelf: "today", query: "USB-C Hub", sortBy: "bestsellers" },
      { shelf: "today", query: "Wireless Earbuds", sortBy: "bestsellers" }
    );
  }
  if (want.has("gaming")) {
    seeds.push(
      { shelf: "gaming", query: "Gaming Keyboard", sortBy: "bestsellers" },
      { shelf: "gaming", query: "Gaming Headset", sortBy: "bestsellers" },
      { shelf: "gaming", query: "RGB Mouse Pad", sortBy: "bestsellers" }
    );
  }
  if (want.has("mobil")) {
    seeds.push(
      { shelf: "mobil", query: "Phone Case", sortBy: "bestsellers" },
      { shelf: "mobil", query: "Power Bank", sortBy: "bestsellers" },
      { shelf: "mobil", query: "MagSafe Charger", sortBy: "bestsellers" }
    );
  }
  if (want.has("kontor")) {
    seeds.push(
      { shelf: "kontor", query: "Mechanical Keyboard", sortBy: "bestsellers" },
      { shelf: "kontor", query: "Webcam", sortBy: "bestsellers" },
      { shelf: "kontor", query: "Monitor Stand", sortBy: "relevance" }
    );
  }
  if (want.has("hjem")) {
    seeds.push(
      { shelf: "hjem", query: "LED Desk Lamp", sortBy: "bestsellers" },
      { shelf: "hjem", query: "Smart Plug", sortBy: "bestsellers" }
    );
  }
  if (want.has("elektronikk")) {
    seeds.push(
      { shelf: "elektronikk", query: "Bluetooth Speaker", sortBy: "bestsellers" },
      { shelf: "elektronikk", query: "HDMI Cable", sortBy: "bestsellers" }
    );
  }
  if (want.has("trending")) {
    seeds.push({ shelf: "trending", query: "Wireless Charging", sortBy: "bestsellers" });
  }
  if (want.has("new")) {
    seeds.push({ shelf: "new", query: "Gadgets", sortBy: "newest" });
  }

  // Profile-driven extras
  for (const cat of profile.categories.slice(0, 3)) {
    if (!seeds.some((s) => s.query.toLowerCase().includes(cat.toLowerCase().slice(0, 5)))) {
      seeds.push({
        shelf: "today",
        query: cat.replace("&", " ").trim(),
        sortBy: "bestsellers",
      });
    }
  }

  return seeds;
}
