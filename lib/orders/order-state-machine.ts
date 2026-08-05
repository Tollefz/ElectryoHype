/**
 * Order Automation — state machine.
 * Every order is always in exactly one phase. Transitions are explicit + logged.
 */

import type { FulfillmentStatus, OrderAutomationPhase } from "@prisma/client";

export type AutomationPhase = OrderAutomationPhase;

/** Happy-path progression (errors are side branches). */
export const AUTOMATION_HAPPY_PATH: AutomationPhase[] = [
  "NEW",
  "PAID",
  "VALIDATING",
  "READY_FOR_CJ",
  "SENT_TO_CJ",
  "ORDERED",
  "TRACKING_RECEIVED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
];

export const AUTOMATION_ERROR_PHASES: AutomationPhase[] = [
  "PAYMENT_FAILED",
  "ADDRESS_ERROR",
  "CJ_ERROR",
  "WAITING_FOR_STOCK",
  "WAITING_FOR_RETRY",
  "MANUAL_REVIEW",
];

const ALLOWED: Record<AutomationPhase, AutomationPhase[]> = {
  NEW: ["PAID", "PAYMENT_FAILED", "MANUAL_REVIEW"],
  PAID: ["VALIDATING", "MANUAL_REVIEW"],
  VALIDATING: [
    "READY_FOR_CJ",
    "ADDRESS_ERROR",
    "WAITING_FOR_STOCK",
    "MANUAL_REVIEW",
  ],
  READY_FOR_CJ: ["SENT_TO_CJ", "CJ_ERROR", "WAITING_FOR_RETRY", "MANUAL_REVIEW"],
  SENT_TO_CJ: ["ORDERED", "CJ_ERROR", "WAITING_FOR_RETRY", "MANUAL_REVIEW"],
  ORDERED: ["TRACKING_RECEIVED", "SHIPPED", "CJ_ERROR", "WAITING_FOR_RETRY"],
  TRACKING_RECEIVED: ["SHIPPED", "DELIVERED"],
  SHIPPED: ["DELIVERED", "COMPLETED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  PAYMENT_FAILED: ["PAID", "MANUAL_REVIEW"],
  ADDRESS_ERROR: ["VALIDATING", "MANUAL_REVIEW"],
  CJ_ERROR: ["WAITING_FOR_RETRY", "READY_FOR_CJ", "MANUAL_REVIEW"],
  WAITING_FOR_STOCK: ["VALIDATING", "MANUAL_REVIEW"],
  WAITING_FOR_RETRY: ["READY_FOR_CJ", "SENT_TO_CJ", "ORDERED", "MANUAL_REVIEW"],
  MANUAL_REVIEW: [
    "PAID",
    "VALIDATING",
    "READY_FOR_CJ",
    "WAITING_FOR_RETRY",
    "COMPLETED",
  ],
};

export function canTransition(
  from: AutomationPhase,
  to: AutomationPhase
): boolean {
  if (from === to) return true;
  return (ALLOWED[from] || []).includes(to);
}

export function assertTransition(
  from: AutomationPhase,
  to: AutomationPhase
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid order automation transition: ${from} → ${to}`);
  }
}

/** Keep legacy fulfillmentStatus aligned for existing admin UI. */
export function fulfillmentStatusForPhase(
  phase: AutomationPhase
): FulfillmentStatus | null {
  switch (phase) {
    case "NEW":
    case "PAID":
    case "VALIDATING":
    case "READY_FOR_CJ":
    case "WAITING_FOR_STOCK":
    case "WAITING_FOR_RETRY":
    case "ADDRESS_ERROR":
    case "PAYMENT_FAILED":
      return "NEW";
    case "SENT_TO_CJ":
    case "ORDERED":
    case "CJ_ERROR":
      return "ORDERED_FROM_SUPPLIER";
    case "TRACKING_RECEIVED":
    case "SHIPPED":
      return "SHIPPED";
    case "DELIVERED":
    case "COMPLETED":
      return "DELIVERED";
    case "MANUAL_REVIEW":
      return null; // leave fulfillment as-is
    default:
      return null;
  }
}

export function isTerminalPhase(phase: AutomationPhase): boolean {
  return phase === "COMPLETED";
}

export function isErrorPhase(phase: AutomationPhase): boolean {
  return (AUTOMATION_ERROR_PHASES as string[]).includes(phase);
}

export function phaseLabelNb(phase: AutomationPhase): string {
  const labels: Record<AutomationPhase, string> = {
    NEW: "Ny",
    PAID: "Betalt",
    VALIDATING: "Validerer",
    READY_FOR_CJ: "Klar for CJ",
    SENT_TO_CJ: "Sendt til CJ",
    ORDERED: "Bestilt hos CJ",
    TRACKING_RECEIVED: "Tracking mottatt",
    SHIPPED: "Sendt",
    DELIVERED: "Levert",
    COMPLETED: "Fullført",
    PAYMENT_FAILED: "Betaling feilet",
    ADDRESS_ERROR: "Adressefeil",
    CJ_ERROR: "CJ-feil",
    WAITING_FOR_STOCK: "Venter på lager",
    WAITING_FOR_RETRY: "Venter på retry",
    MANUAL_REVIEW: "Manuell gjennomgang",
  };
  return labels[phase] || phase;
}

/** Max automated retries before MANUAL_REVIEW. */
export const MAX_AUTOMATION_RETRIES = 3;

/** Backoff minutes per retry attempt (1-indexed). */
export function retryDelayMinutes(attempt: number): number {
  if (attempt <= 1) return 5;
  if (attempt === 2) return 30;
  return 120;
}
