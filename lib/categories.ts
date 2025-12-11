/**
 * Central category definitions for the store
 * 
 * This is the single source of truth for category mappings:
 * - URL slugs (used in /products?category=slug)
 * - Display labels (shown to users)
 * - Database values (stored in Product.category)
 */

export const CATEGORY_DEFINITIONS = {
  data: {
    slug: "data",
    label: "Data & IT",
    dbValue: "Data & IT", // Value stored in database
  },
  tv: {
    slug: "tv",
    label: "TV, Lyd & Bilde",
    dbValue: "TV, Lyd & Bilde",
  },
  mobil: {
    slug: "mobil",
    label: "Mobil & Tilbehør",
    dbValue: "Mobil & Tilbehør",
  },
  gaming: {
    slug: "gaming",
    label: "Gaming",
    dbValue: "Gaming",
  },
  hvitevarer: {
    slug: "hvitevarer",
    label: "Hvitevarer",
    dbValue: "Hvitevarer",
  },
  hjem: {
    slug: "hjem",
    label: "Hjem & Fritid",
    dbValue: "Hjem & Fritid",
  },
} as const;

export type CategorySlug = keyof typeof CATEGORY_DEFINITIONS;

/**
 * Get category definition by slug
 */
export function getCategoryBySlug(slug: string | null | undefined) {
  if (!slug) return null;
  return CATEGORY_DEFINITIONS[slug as CategorySlug] || null;
}

/**
 * Get category definition by database value
 */
export function getCategoryByDbValue(dbValue: string | null | undefined) {
  if (!dbValue) return null;
  return Object.values(CATEGORY_DEFINITIONS).find((cat) => cat.dbValue === dbValue) || null;
}

/**
 * Get all category slugs
 */
export function getAllCategorySlugs(): CategorySlug[] {
  return Object.keys(CATEGORY_DEFINITIONS) as CategorySlug[];
}

/**
 * Get all category labels for display
 */
export function getAllCategoryLabels(): string[] {
  return Object.values(CATEGORY_DEFINITIONS).map((cat) => cat.label);
}

/**
 * Get all database values
 */
export function getAllDbValues(): string[] {
  return Object.values(CATEGORY_DEFINITIONS).map((cat) => cat.dbValue);
}

