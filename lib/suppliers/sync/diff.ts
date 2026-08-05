/**
 * Change detection between stored supplier snapshot and fresh InternalProduct.
 */

import { SupplierChangeType } from "@prisma/client";
import type { InternalProduct } from "@/lib/suppliers/internal-product";
import { snapshotInternalProduct } from "@/lib/suppliers/internal-product";

export type DetectedChange = {
  changeType: SupplierChangeType;
  field: string;
  before: unknown;
  after: unknown;
  summary: string;
};

type Snapshot = ReturnType<typeof snapshotInternalProduct>;

function asSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Snapshot;
}

export function detectSupplierChanges(
  previous: unknown,
  next: InternalProduct
): DetectedChange[] {
  const before = asSnapshot(previous);
  const after = snapshotInternalProduct(next);
  if (!before) return [];

  const changes: DetectedChange[] = [];

  if (Number(before.price) !== Number(after.price)) {
    changes.push({
      changeType: SupplierChangeType.price,
      field: "price",
      before: before.price,
      after: after.price,
      summary: `Pris ${before.price} → ${after.price} ${after.currency}`,
    });
  }

  if (Number(before.stock ?? -1) !== Number(after.stock ?? -1)) {
    changes.push({
      changeType: SupplierChangeType.stock,
      field: "stock",
      before: before.stock,
      after: after.stock,
      summary: `Lager ${before.stock ?? "?"} → ${after.stock ?? "?"}`,
    });
  }

  const beforeImages = new Set((before.images as string[]) || []);
  const afterImages = new Set((after.images as string[]) || []);
  const addedImages = [...afterImages].filter((u) => !beforeImages.has(u));
  const removedImages = [...beforeImages].filter((u) => !afterImages.has(u));
  if (addedImages.length) {
    changes.push({
      changeType: SupplierChangeType.images_added,
      field: "images",
      before: [...beforeImages],
      after: addedImages,
      summary: `${addedImages.length} nye bilder`,
    });
  }
  if (removedImages.length) {
    changes.push({
      changeType: SupplierChangeType.images_removed,
      field: "images",
      before: removedImages,
      after: [...afterImages],
      summary: `${removedImages.length} bilder fjernet`,
    });
  }

  const beforeVariants = new Map(
    ((before.variants as Array<{ id: string }>) || []).map((v) => [v.id, v])
  );
  const afterVariants = new Map(
    ((after.variants as Array<{ id: string }>) || []).map((v) => [v.id, v])
  );
  const addedVariants = [...afterVariants.keys()].filter((id) => !beforeVariants.has(id));
  const removedVariants = [...beforeVariants.keys()].filter((id) => !afterVariants.has(id));
  if (addedVariants.length) {
    changes.push({
      changeType: SupplierChangeType.variants_added,
      field: "variants",
      before: null,
      after: addedVariants,
      summary: `${addedVariants.length} nye varianter`,
    });
  }
  if (removedVariants.length) {
    changes.push({
      changeType: SupplierChangeType.variants_removed,
      field: "variants",
      before: removedVariants,
      after: null,
      summary: `${removedVariants.length} varianter fjernet`,
    });
  }

  const beforeSpecs = JSON.stringify(before.specifications || {});
  const afterSpecs = JSON.stringify(after.specifications || {});
  if (beforeSpecs !== afterSpecs) {
    changes.push({
      changeType: SupplierChangeType.specs,
      field: "specifications",
      before: before.specifications,
      after: after.specifications,
      summary: "Spesifikasjoner endret",
    });
  }

  const beforeAttrs = JSON.stringify(before.attributes || {});
  const afterAttrs = JSON.stringify(after.attributes || {});
  if (beforeAttrs !== afterAttrs) {
    changes.push({
      changeType: SupplierChangeType.attributes,
      field: "attributes",
      before: before.attributes,
      after: after.attributes,
      summary: "Attributter endret",
    });
  }

  const beforeVideos = JSON.stringify(before.videos || []);
  const afterVideos = JSON.stringify(after.videos || []);
  if (beforeVideos !== afterVideos) {
    changes.push({
      changeType: SupplierChangeType.videos,
      field: "videos",
      before: before.videos,
      after: after.videos,
      summary: "Videoer endret",
    });
  }

  return changes;
}
