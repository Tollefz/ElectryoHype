/**
 * Self-Improving Store — types.
 */

export type StoreObjectiveTargets = {
  increaseMargin: number;
  increaseQuality: number;
  increaseSeo: number;
  increaseCatalogQuality: number;
  reduceLowQuality: number;
  reduceOutOfStock: number;
  reduceDuplicates: number;
  reduceMissingSpecs: number;
};

export const DEFAULT_OBJECTIVES: StoreObjectiveTargets = {
  increaseMargin: 0.2,
  increaseQuality: 0.2,
  increaseSeo: 0.15,
  increaseCatalogQuality: 0.15,
  reduceLowQuality: 0.1,
  reduceOutOfStock: 0.1,
  reduceDuplicates: 0.05,
  reduceMissingSpecs: 0.05,
};

export type QualityBreakdown = {
  images: number;
  seo: number;
  description: number;
  specs: number;
  category: number;
  price: number;
  supplier: number;
  margin: number;
  stock: number;
  confidence: number;
  total: number;
};

export type ImprovementKind =
  | "seo"
  | "description"
  | "images"
  | "category"
  | "price"
  | "specs"
  | "tags"
  | "retire_unpublish"
  | "retire_replace"
  | "retire_archive"
  | "switch_supplier"
  | "update";

export type ImproveRunStats = {
  productsScored: number;
  improvementsCreated: number;
  retirementProposed: number;
  avgQualityBefore: number | null;
  avgQualityAfter: number | null;
  pendingApprovals: number;
};
