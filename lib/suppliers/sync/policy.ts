/**
 * SyncPolicy decisions — apply or queue based on per-account field policy.
 */

import "server-only";

import { SyncFieldPolicy, type SyncPolicy, type SupplierChangeType } from "@prisma/client";

export type PolicyAction = "apply" | "queue" | "ignore" | "regenerate_ai";

const CHANGE_TO_POLICY_FIELD: Partial<
  Record<SupplierChangeType, keyof Pick<
    SyncPolicy,
    | "stock"
    | "supplierPrice"
    | "retailPrice"
    | "images"
    | "videos"
    | "specs"
    | "attributes"
    | "variants"
    | "seo"
    | "ai"
  >>
> = {
  stock: "stock",
  price: "supplierPrice",
  images_added: "images",
  images_removed: "images",
  videos: "videos",
  specs: "specs",
  attributes: "attributes",
  variants_added: "variants",
  variants_removed: "variants",
};

export function decideSyncAction(
  policy: SyncPolicy | null | undefined,
  changeType: SupplierChangeType,
  opts?: { isNewAsset?: boolean; supplierContentChanged?: boolean }
): PolicyAction {
  if (!policy) {
    // Safe defaults matching enterprise foundation
    if (changeType === "stock" || changeType === "price") return "apply";
    if (changeType === "images_added") return "apply";
    if (changeType === "videos") return "apply";
    return "queue";
  }

  const field = CHANGE_TO_POLICY_FIELD[changeType];
  if (!field) {
    if (changeType === "unavailable" || changeType === "available") return "apply";
    return "queue";
  }

  const rule = policy[field] as SyncFieldPolicy;

  switch (rule) {
    case SyncFieldPolicy.auto:
      return "apply";
    case SyncFieldPolicy.auto_if_new:
      return opts?.isNewAsset ? "apply" : "queue";
    case SyncFieldPolicy.manual:
      return "queue";
    case SyncFieldPolicy.never:
      return "ignore";
    case SyncFieldPolicy.regenerate_if_changed:
      return opts?.supplierContentChanged ? "regenerate_ai" : "ignore";
    default:
      return "queue";
  }
}

export function retailPriceMayAutoApply(policy: SyncPolicy | null | undefined): boolean {
  return policy?.retailPrice === SyncFieldPolicy.auto;
}

export function seoMayOverwrite(policy: SyncPolicy | null | undefined): boolean {
  return policy?.seo === SyncFieldPolicy.auto;
}

export function aiShouldRegenerate(
  policy: SyncPolicy | null | undefined,
  supplierChanged: boolean
): boolean {
  if (!policy) return supplierChanged;
  if (policy.ai === SyncFieldPolicy.never) return false;
  if (policy.ai === SyncFieldPolicy.auto) return true;
  if (policy.ai === SyncFieldPolicy.regenerate_if_changed) return supplierChanged;
  return false;
}

export const DEFAULT_SYNC_POLICY_VIEW = {
  stock: "auto",
  supplierPrice: "auto",
  retailPrice: "manual",
  seo: "never",
  ai: "regenerate_if_changed",
  images: "auto_if_new",
  videos: "auto",
  specs: "auto",
  attributes: "auto",
  variants: "manual",
} as const;
