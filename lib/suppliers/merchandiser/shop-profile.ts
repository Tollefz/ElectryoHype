/**
 * ElectroHypeX shop profile — drives Merchandiser scoring & prompts.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MERCHANDISER_SETTINGS,
  type MerchandiserSettings,
  type ShopProfileData,
} from "@/lib/suppliers/merchandiser/types";

export const DEFAULT_SHOP_PROFILE: Omit<ShopProfileData, "id" | "storeId"> = {
  name: "ElectroHypeX",
  audience:
    "Norske forbrukere 18–45 som handler elektronikk, gaming og smart tilbehør online. Verdsetter raskt oversikt, troverdige bilder og rettferdig pris — ikke billigst-mulig-juks.",
  priceLevel: "mid",
  designStyle:
    "Rent, moderne, premium-feel uten å være luksus. Produktbilder med hvite/nøytrale bakgrunner. Lite støy, tydelig verdi.",
  productStrategy:
    "Kuratert katalog — færre, bedre produkter. Prioriter gaming, mobiltilbehør, data/IT og smart hjem. Unngå generiske no-name bulkvarer med dårlig bildekvalitet. Impuls- og gavevennlige produkter er ønsket når margin og bilder er sterke.",
  categories: [
    "Gaming",
    "Mobil & Tilbehør",
    "Data & IT",
    "TV, Lyd & Bilde",
    "Hjem & Fritid",
  ],
  qualityLevel: "high",
  brandVoice:
    "Direkte, kompetent, norsk. Hjelper kunden å velge riktig — ingen oversalg.",
  avoidCategories: ["Hvitevarer", "Bulk no-name uten specs"],
  merchandiserSettings: { ...DEFAULT_MERCHANDISER_SETTINGS },
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

function parseSettings(raw: unknown): MerchandiserSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    autoQueueEnabled: Boolean(o.autoQueueEnabled ?? DEFAULT_MERCHANDISER_SETTINGS.autoQueueEnabled),
    autoQueueMinScore: Number(
      o.autoQueueMinScore ?? DEFAULT_MERCHANDISER_SETTINGS.autoQueueMinScore
    ),
    defaultBatchSize: ([10, 25, 100].includes(Number(o.defaultBatchSize))
      ? Number(o.defaultBatchSize)
      : DEFAULT_MERCHANDISER_SETTINGS.defaultBatchSize) as 10 | 25 | 100,
    minScoreToShow: Number(o.minScoreToShow ?? DEFAULT_MERCHANDISER_SETTINGS.minScoreToShow),
    trendSignalsEnabled: Boolean(
      o.trendSignalsEnabled ?? DEFAULT_MERCHANDISER_SETTINGS.trendSignalsEnabled
    ),
  };
}

export function mapShopProfileRow(row: {
  id: string;
  storeId: string | null;
  name: string;
  audience: string;
  priceLevel: string;
  designStyle: string | null;
  productStrategy: string | null;
  categories: unknown;
  qualityLevel: string;
  brandVoice: string | null;
  avoidCategories: unknown;
  merchandiserSettings: unknown;
}): ShopProfileData {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    audience: row.audience,
    priceLevel: row.priceLevel,
    designStyle: row.designStyle,
    productStrategy: row.productStrategy,
    categories: asStringArray(row.categories),
    qualityLevel: row.qualityLevel,
    brandVoice: row.brandVoice,
    avoidCategories: asStringArray(row.avoidCategories),
    merchandiserSettings: parseSettings(row.merchandiserSettings),
  };
}

/** Get or create the default ElectroHypeX profile. */
export async function getOrCreateShopProfile(storeId?: string | null): Promise<ShopProfileData> {
  const existing = storeId
    ? await prisma.shopProfile.findUnique({ where: { storeId } })
    : await prisma.shopProfile.findFirst({ orderBy: { createdAt: "asc" } });

  if (existing) return mapShopProfileRow(existing);

  const created = await prisma.shopProfile.create({
    data: {
      storeId: storeId || null,
      name: DEFAULT_SHOP_PROFILE.name,
      audience: DEFAULT_SHOP_PROFILE.audience,
      priceLevel: DEFAULT_SHOP_PROFILE.priceLevel,
      designStyle: DEFAULT_SHOP_PROFILE.designStyle,
      productStrategy: DEFAULT_SHOP_PROFILE.productStrategy,
      categories: DEFAULT_SHOP_PROFILE.categories,
      qualityLevel: DEFAULT_SHOP_PROFILE.qualityLevel,
      brandVoice: DEFAULT_SHOP_PROFILE.brandVoice,
      avoidCategories: DEFAULT_SHOP_PROFILE.avoidCategories,
      merchandiserSettings: DEFAULT_SHOP_PROFILE.merchandiserSettings,
    },
  });
  return mapShopProfileRow(created);
}

export async function updateShopProfile(
  patch: Partial<ShopProfileData> & { id?: string },
  storeId?: string | null
): Promise<ShopProfileData> {
  const current = await getOrCreateShopProfile(storeId);
  const id = patch.id || current.id;
  if (!id) throw new Error("ShopProfile mangler id");

  const updated = await prisma.shopProfile.update({
    where: { id },
    data: {
      name: patch.name ?? undefined,
      audience: patch.audience ?? undefined,
      priceLevel: patch.priceLevel ?? undefined,
      designStyle: patch.designStyle ?? undefined,
      productStrategy: patch.productStrategy ?? undefined,
      categories: patch.categories ?? undefined,
      qualityLevel: patch.qualityLevel ?? undefined,
      brandVoice: patch.brandVoice ?? undefined,
      avoidCategories: patch.avoidCategories ?? undefined,
      merchandiserSettings: patch.merchandiserSettings ?? undefined,
    },
  });
  return mapShopProfileRow(updated);
}

/** Compact text block injected into AI prompts. */
export function shopProfilePromptBlock(profile: ShopProfileData): string {
  return [
    `Butikk: ${profile.name}`,
    `Målgruppe: ${profile.audience}`,
    `Prisnivå: ${profile.priceLevel}`,
    `Kvalitetsnivå: ${profile.qualityLevel}`,
    `Design: ${profile.designStyle || "—"}`,
    `Strategi: ${profile.productStrategy || "—"}`,
    `Kategorier: ${profile.categories.join(", ")}`,
    `Unngå: ${(profile.avoidCategories || []).join(", ") || "—"}`,
    `Stemme: ${profile.brandVoice || "—"}`,
  ].join("\n");
}
