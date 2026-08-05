/**
 * AI Missions — category-building assignments for Digital Buyer.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { startBuyerScan } from "@/lib/buyer/scan";
import {
  CATEGORY_MISSIONS,
  getCategoryMission,
  isMissionSize,
  resolveMissionTargetCount,
  type BuyerMissionSize,
  type BuyerQuantityChoice,
} from "@/lib/buyer/category-missions";

export async function createMission(input: {
  title: string;
  brief?: string;
  targetCount?: number;
  storeId?: string | null;
}) {
  return prisma.storeMission.create({
    data: {
      storeId: input.storeId || null,
      title: input.title,
      brief: input.brief || null,
      targetCount: input.targetCount ?? 20,
      status: "active",
    },
  });
}

export async function listMissions(limit = 10) {
  return prisma.storeMission.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Kick off a category-building Digital Buyer scan for an active mission. */
export async function executeMission(
  missionId: string,
  opts?: { quantityChoice?: BuyerQuantityChoice }
) {
  const mission = await prisma.storeMission.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("Oppdrag ikke funnet");
  if (mission.status !== "active") throw new Error("Oppdrag er ikke aktivt");

  const categoryId =
    typeof (mission.result as { categoryId?: string } | null)?.categoryId === "string"
      ? (mission.result as { categoryId: string }).categoryId
      : CATEGORY_MISSIONS.find((m) =>
          mission.title.toLowerCase().includes(m.id)
        )?.id ||
        CATEGORY_MISSIONS.find((m) =>
          mission.title.toLowerCase().includes(m.label.replace("Bygg ", "").toLowerCase())
        )?.id ||
        null;

  const def = categoryId ? getCategoryMission(categoryId) : null;
  const quantityChoice = opts?.quantityChoice ?? "ai";
  const target = def
    ? resolveMissionTargetCount(quantityChoice, def)
    : Math.min(500, Math.max(25, mission.targetCount || 50));

  const scan = await startBuyerScan({
    targetScanCount: target,
    quantityChoice,
    categoryId,
    processInline: target <= 25,
    storeId: mission.storeId,
    startedBy: "store_mission",
  });

  await prisma.storeMission.update({
    where: { id: missionId },
    data: {
      targetCount: target,
      result: {
        categoryId,
        scanId: scan.id,
        startedAt: new Date().toISOString(),
        note: def
          ? `Bygger ${def.label} — AI velger underkategorier og produkter.`
          : `Digital Buyer startet for: ${mission.title}`,
      },
    },
  });

  return { missionId, scanId: scan.id, categoryId };
}

/** Start a category mission directly (Rob's Desk / Buyer) — no StoreMission row required. */
export async function startCategoryMission(input: {
  categoryId: string;
  quantityChoice?: BuyerQuantityChoice;
  missionSize?: BuyerMissionSize;
  storeId?: string | null;
  processInline?: boolean;
}) {
  const def = getCategoryMission(input.categoryId);
  if (!def) throw new Error("Ukjent kategorioppdrag");

  const missionSize: BuyerMissionSize | undefined =
    input.missionSize ||
    (isMissionSize(input.quantityChoice) ? input.quantityChoice : undefined);
  const quantityChoice: BuyerQuantityChoice =
    missionSize || input.quantityChoice || "standard";
  const target = resolveMissionTargetCount(quantityChoice, def);

  // Keep a StoreMission row so Desk history stays coherent
  const row = await prisma.storeMission.create({
    data: {
      storeId: input.storeId || null,
      title: `${def.emoji} ${def.label}`,
      brief: def.brief,
      targetCount: target,
      status: "active",
      result: {
        categoryId: def.id,
        subcategoryPlan: def.subcategories,
        missionSize: missionSize || null,
      },
    },
  });

  const scan = await startBuyerScan({
    targetScanCount: target,
    quantityChoice,
    missionSize: missionSize || (isMissionSize(quantityChoice) ? quantityChoice : undefined),
    categoryId: def.id,
    processInline: input.processInline ?? target <= 100,
    storeId: input.storeId,
    startedBy: "category_mission",
  });

  await prisma.storeMission.update({
    where: { id: row.id },
    data: {
      result: {
        categoryId: def.id,
        scanId: scan.id,
        startedAt: new Date().toISOString(),
        subcategoryPlan: def.subcategories,
        missionSize: missionSize || null,
        note: `AI bygger ${def.label} — ${target.toLocaleString("no-NO")} produkter i planen.`,
      },
    },
  });

  return {
    missionId: row.id,
    scanId: scan.id,
    categoryId: def.id,
    target,
    missionSize: missionSize || null,
  };
}

export async function completeMission(missionId: string) {
  return prisma.storeMission.update({
    where: { id: missionId },
    data: { status: "completed", completedAt: new Date() },
  });
}

/** Seed category-building missions if none exist. */
export async function ensureDefaultMissions(storeId?: string | null) {
  const count = await prisma.storeMission.count({
    where: { status: "active" },
  });
  if (count > 0) return [];

  const created = [];
  for (const m of CATEGORY_MISSIONS) {
    created.push(
      await createMission({
        title: `${m.emoji} ${m.label}`,
        brief: m.brief,
        targetCount: resolveMissionTargetCount("ai", m),
        storeId,
      })
    );
    // Stamp categoryId into result for executeMission
    const last = created[created.length - 1];
    await prisma.storeMission.update({
      where: { id: last.id },
      data: {
        result: {
          categoryId: m.id,
          subcategoryPlan: m.subcategories,
        },
      },
    });
  }
  return created;
}
