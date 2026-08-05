/**
 * Self-Improving Store — public surface.
 */

export type * from "@/lib/improve/types";
export { DEFAULT_OBJECTIVES } from "@/lib/improve/types";
export { computeProductQuality } from "@/lib/improve/quality";
export {
  getOrCreateStoreObjectives,
  updateStoreObjectives,
} from "@/lib/improve/objectives";
export { scoreAllProducts, discoverImprovements } from "@/lib/improve/discover";
export { decideImprovement, applyImprovement } from "@/lib/improve/apply";
export {
  createMission,
  listMissions,
  executeMission,
  completeMission,
  ensureDefaultMissions,
  startCategoryMission,
} from "@/lib/improve/missions";
export {
  runNightlySelfImprove,
  getLatestImproveRun,
  getDeskImproveBundle,
} from "@/lib/improve/nightly";
