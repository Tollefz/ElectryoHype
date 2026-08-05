/**
 * Store objectives — measurable targets for all AI engines.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_OBJECTIVES,
  type StoreObjectiveTargets,
} from "@/lib/improve/types";

function parseTargets(raw: unknown): StoreObjectiveTargets {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, number>;
  return {
    increaseMargin: Number(o.increaseMargin ?? DEFAULT_OBJECTIVES.increaseMargin),
    increaseQuality: Number(o.increaseQuality ?? DEFAULT_OBJECTIVES.increaseQuality),
    increaseSeo: Number(o.increaseSeo ?? DEFAULT_OBJECTIVES.increaseSeo),
    increaseCatalogQuality: Number(
      o.increaseCatalogQuality ?? DEFAULT_OBJECTIVES.increaseCatalogQuality
    ),
    reduceLowQuality: Number(o.reduceLowQuality ?? DEFAULT_OBJECTIVES.reduceLowQuality),
    reduceOutOfStock: Number(o.reduceOutOfStock ?? DEFAULT_OBJECTIVES.reduceOutOfStock),
    reduceDuplicates: Number(o.reduceDuplicates ?? DEFAULT_OBJECTIVES.reduceDuplicates),
    reduceMissingSpecs: Number(
      o.reduceMissingSpecs ?? DEFAULT_OBJECTIVES.reduceMissingSpecs
    ),
  };
}

export async function getOrCreateStoreObjectives(storeId?: string | null) {
  const existing = storeId
    ? await prisma.storeObjectives.findUnique({ where: { storeId } })
    : await prisma.storeObjectives.findFirst({ orderBy: { updatedAt: "desc" } });

  if (existing) {
    return { id: existing.id, storeId: existing.storeId, targets: parseTargets(existing.targets) };
  }

  const created = await prisma.storeObjectives.create({
    data: {
      storeId: storeId || null,
      targets: DEFAULT_OBJECTIVES as unknown as Prisma.InputJsonValue,
    },
  });
  return {
    id: created.id,
    storeId: created.storeId,
    targets: DEFAULT_OBJECTIVES,
  };
}

export async function updateStoreObjectives(
  patch: Partial<StoreObjectiveTargets>,
  storeId?: string | null
) {
  const current = await getOrCreateStoreObjectives(storeId);
  const targets = { ...current.targets, ...patch };
  await prisma.storeObjectives.update({
    where: { id: current.id },
    data: { targets: targets as unknown as Prisma.InputJsonValue },
  });
  return { id: current.id, storeId: current.storeId, targets };
}
