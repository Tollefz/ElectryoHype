/**
 * Customer Brain — Rob's Desk / Mission Control snapshot.
 * Recommendations only — never auto-emails.
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import {
  advanceCustomerBrain,
  type CustomerBrainSnapshot,
} from "./customer-brain";

export type CustomerDeskStatus = {
  status: "learning" | "ready" | "waiting" | "error";
  narrative: string;
  memoryScore: number;
  rebuiltAt: string;
  counts: {
    scored: number;
    newCustomers: number;
    returning: number;
    vip: number;
    churnRisk: number;
    highLtv: number;
  };
  mission: CustomerBrainSnapshot["mission"];
  insights: CustomerBrainSnapshot["insights"];
  recommendations: CustomerBrainSnapshot["recommendations"];
  memoryStories: CustomerBrainSnapshot["memory"]["stories"];
  topSegments: CustomerBrainSnapshot["memory"]["topSegments"];
  errors: string[];
};

export async function getCustomerDeskStatus(
  storeId = DEFAULT_STORE_ID
): Promise<CustomerDeskStatus> {
  const errors: string[] = [];
  try {
    const brain = await advanceCustomerBrain({ storeId });
    const scored = brain.profiles.length;
    let status: CustomerDeskStatus["status"] = "waiting";
    if (scored > 0) {
      status =
        brain.mission.churnRisk.length > 0 || brain.mission.vip.length > 0
          ? "learning"
          : "ready";
    }

    const narrative =
      scored === 0
        ? "AI CRM venter på kunder med kjøpshistorikk. Jeg bygger profiler (språk, kilde, LTV, favorittkategori) — uten å sende e-post."
        : `AI CRM: ${scored} profiler. ${brain.mission.vip.length} VIP · ${brain.mission.churnRisk.length} churn-risiko. Kun anbefaling — ingen auto-markedsføring.`;

    return {
      status,
      narrative,
      memoryScore: brain.memory.stats.memoryScore,
      rebuiltAt: brain.generatedAt,
      counts: {
        scored,
        newCustomers: brain.mission.newCustomers.length,
        returning: brain.mission.returning.length,
        vip: brain.mission.vip.length,
        churnRisk: brain.mission.churnRisk.length,
        highLtv: brain.mission.highLtv.length,
      },
      mission: {
        newCustomers: brain.mission.newCustomers.slice(0, 8),
        returning: brain.mission.returning.slice(0, 8),
        vip: brain.mission.vip.slice(0, 8),
        churnRisk: brain.mission.churnRisk.slice(0, 8),
        highLtv: brain.mission.highLtv.slice(0, 8),
      },
      insights: brain.insights.slice(0, 10),
      recommendations: brain.recommendations.slice(0, 8),
      memoryStories: brain.memory.stories.slice(0, 6),
      topSegments: brain.memory.topSegments,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      status: "error",
      narrative: "Customer Brain kunne ikke lese kundedata.",
      memoryScore: 0,
      rebuiltAt: new Date().toISOString(),
      counts: {
        scored: 0,
        newCustomers: 0,
        returning: 0,
        vip: 0,
        churnRisk: 0,
        highLtv: 0,
      },
      mission: {
        newCustomers: [],
        returning: [],
        vip: [],
        churnRisk: [],
        highLtv: [],
      },
      insights: [],
      recommendations: [],
      memoryStories: [],
      topSegments: [],
      errors,
    };
  }
}
