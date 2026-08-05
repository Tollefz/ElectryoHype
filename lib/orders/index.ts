/**
 * Order Automation Engine + Order Brain — public surface.
 * Separate from Product Buyer and Marketing Brain.
 * UI observes; workers process fulfillment. Brain never auto-refunds.
 */

export {
  AUTOMATION_HAPPY_PATH,
  AUTOMATION_ERROR_PHASES,
  MAX_AUTOMATION_RETRIES,
  canTransition,
  assertTransition,
  fulfillmentStatusForPhase,
  isTerminalPhase,
  isErrorPhase,
  phaseLabelNb,
  retryDelayMinutes,
  type AutomationPhase,
} from "@/lib/orders/order-state-machine";

export { appendOrderEvent, listOrderEvents } from "@/lib/orders/order-events";
export {
  validateOrderForFulfillment,
  type ValidationResult,
  type ValidationIssue,
} from "@/lib/orders/order-validation";
export { createCjFulfillmentOrder } from "@/lib/orders/cj-fulfillment";
export { pollOrderTracking } from "@/lib/orders/tracking";
export { notifyOrderCustomer } from "@/lib/orders/notifications";
export {
  advanceOrder,
  advanceOrderBrain,
  markOrderPaid,
  type EngineStepResult,
} from "@/lib/orders/order-engine";
export {
  ORDER_WORKER_SETTING_KEY,
  ORDER_BRAIN_SETTING_KEY,
  tickOrderWorker,
  runOrderWorkerLoop,
  claimOrdersForAutomation,
  getOrderAutomationDeskStatus,
  type OrderWorkerDeskStatus,
} from "@/lib/orders/order-worker";

export {
  rebuildOrderMemory,
  getOrderMemory,
  scoreOrderMemoryForSupplier,
  isDelayedOrder,
  ORDER_MEMORY_SETTING_KEY,
  ORDER_MEMORY_NUDGE_MAX,
  type OrderMemorySnapshot,
  type OrderMemoryStory,
} from "@/lib/orders/order-memory";

export {
  getOrderInsights,
  type OrderInsight,
  type OrderInsightKind,
} from "@/lib/orders/order-insights";

export {
  getOrderDashboard,
  type OrderDashboard,
} from "@/lib/orders/order-dashboard";

export {
  buildOrderReport,
  type OrderReport,
} from "@/lib/orders/order-report";

export {
  getOrderBrainDeskStatus,
  type OrderBrainDeskStatus,
  type OrderBrainAttentionItem,
} from "@/lib/orders/order-desk-status";
