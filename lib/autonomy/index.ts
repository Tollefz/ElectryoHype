/**
 * Autonomous Commerce Engine — public surface.
 */

export type * from "@/lib/autonomy/types";
export {
  DEFAULT_STORE_GOAL,
  DEFAULT_QUALITY_GATE,
} from "@/lib/autonomy/types";
export {
  getOrCreateAutonomyPolicy,
  updateAutonomyPolicy,
} from "@/lib/autonomy/policy";
export { runAutonomyQualityGate } from "@/lib/autonomy/quality-gate";
export {
  getOrCreateStoreMemory,
  refreshStoreMemory,
  memoryFitScore,
} from "@/lib/autonomy/memory";
export {
  discoverAutonomyTasks,
  listOpenAutonomyTasks,
} from "@/lib/autonomy/tasks";
export {
  runAutonomyCycle,
  getLatestAutonomyBrief,
  listAutonomyRuns,
} from "@/lib/autonomy/orchestrator";
export { buildMorningBrief } from "@/lib/autonomy/brief";
