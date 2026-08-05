/**
 * Autonomy policy + store goal.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { AutonomyMode as PrismaMode } from "@prisma/client";
import {
  DEFAULT_QUALITY_GATE,
  DEFAULT_STORE_GOAL,
  type AutonomyMode,
  type AutonomyQualityThresholds,
  type StoreGoal,
} from "@/lib/autonomy/types";

export type AutonomyPolicyData = {
  id: string;
  storeId: string | null;
  mode: AutonomyMode;
  storeGoal: StoreGoal;
  qualityGate: AutonomyQualityThresholds;
  scheduleEnabled: boolean;
  maxImportsPerRun: number;
  minMerchandiserScore: number;
  deepAnalyzeTop: number;
};

function parseGoal(raw: unknown): StoreGoal {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, number>;
  return {
    quality: Number(o.quality ?? DEFAULT_STORE_GOAL.quality),
    margin: Number(o.margin ?? DEFAULT_STORE_GOAL.margin),
    customerExperience: Number(
      o.customerExperience ?? DEFAULT_STORE_GOAL.customerExperience
    ),
    minimizeManual: Number(o.minimizeManual ?? DEFAULT_STORE_GOAL.minimizeManual),
  };
}

function parseGate(raw: unknown): AutonomyQualityThresholds {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    minImages: Number(o.minImages ?? DEFAULT_QUALITY_GATE.minImages),
    minSpecs: Number(o.minSpecs ?? DEFAULT_QUALITY_GATE.minSpecs),
    minMarginPct: Number(o.minMarginPct ?? DEFAULT_QUALITY_GATE.minMarginPct),
    minMerchandiserScore: Number(
      o.minMerchandiserScore ?? DEFAULT_QUALITY_GATE.minMerchandiserScore
    ),
    minCategoryConfidence: Number(
      o.minCategoryConfidence ?? DEFAULT_QUALITY_GATE.minCategoryConfidence
    ),
    minOverallConfidence: Number(
      o.minOverallConfidence ?? DEFAULT_QUALITY_GATE.minOverallConfidence
    ),
    requireKnownCategory: Boolean(
      o.requireKnownCategory ?? DEFAULT_QUALITY_GATE.requireKnownCategory
    ),
  };
}

function mapRow(row: {
  id: string;
  storeId: string | null;
  mode: PrismaMode;
  storeGoal: unknown;
  qualityGate: unknown;
  scheduleEnabled: boolean;
  maxImportsPerRun: number;
  minMerchandiserScore: number;
  deepAnalyzeTop: number;
}): AutonomyPolicyData {
  return {
    id: row.id,
    storeId: row.storeId,
    mode: row.mode as AutonomyMode,
    storeGoal: parseGoal(row.storeGoal),
    qualityGate: parseGate(row.qualityGate),
    scheduleEnabled: row.scheduleEnabled,
    maxImportsPerRun: row.maxImportsPerRun,
    minMerchandiserScore: row.minMerchandiserScore,
    deepAnalyzeTop: row.deepAnalyzeTop,
  };
}

export async function getOrCreateAutonomyPolicy(
  storeId?: string | null
): Promise<AutonomyPolicyData> {
  const existing = storeId
    ? await prisma.autonomyPolicy.findUnique({ where: { storeId } })
    : await prisma.autonomyPolicy.findFirst({ orderBy: { createdAt: "asc" } });

  if (existing) return mapRow(existing);

  const created = await prisma.autonomyPolicy.create({
    data: {
      storeId: storeId || null,
      mode: "off",
      storeGoal: DEFAULT_STORE_GOAL,
      qualityGate: DEFAULT_QUALITY_GATE,
      scheduleEnabled: true,
      maxImportsPerRun: 10,
      minMerchandiserScore: 80,
      deepAnalyzeTop: 8,
    },
  });
  return mapRow(created);
}

export async function updateAutonomyPolicy(
  patch: Partial<{
    mode: AutonomyMode;
    storeGoal: StoreGoal;
    qualityGate: AutonomyQualityThresholds;
    scheduleEnabled: boolean;
    maxImportsPerRun: number;
    minMerchandiserScore: number;
    deepAnalyzeTop: number;
  }>,
  storeId?: string | null
): Promise<AutonomyPolicyData> {
  const current = await getOrCreateAutonomyPolicy(storeId);
  const updated = await prisma.autonomyPolicy.update({
    where: { id: current.id },
    data: {
      mode: patch.mode,
      storeGoal: patch.storeGoal,
      qualityGate: patch.qualityGate,
      scheduleEnabled: patch.scheduleEnabled,
      maxImportsPerRun: patch.maxImportsPerRun,
      minMerchandiserScore: patch.minMerchandiserScore,
      deepAnalyzeTop: patch.deepAnalyzeTop,
    },
  });
  return mapRow(updated);
}
