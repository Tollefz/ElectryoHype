/**
 * Finance events — append-only brain audit (Setting-backed).
 * No price changes. Observation only.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FINANCE_EVENTS_SETTING_KEY = "finance_brain_events";

export type FinanceEvent = {
  id: string;
  type: string;
  message: string;
  at: string;
  meta?: Record<string, unknown>;
};

const MAX_EVENTS = 100;

export async function appendFinanceEvent(input: {
  type: string;
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const row = await prisma.setting.findUnique({
    where: { key: FINANCE_EVENTS_SETTING_KEY },
  });
  let list: FinanceEvent[] = [];
  if (row?.value && typeof row.value === "object" && Array.isArray((row.value as { events?: unknown }).events)) {
    list = (row.value as { events: FinanceEvent[] }).events;
  }
  list.push({
    id: `fe_${Date.now().toString(36)}`,
    type: input.type,
    message: input.message.slice(0, 500),
    at: new Date().toISOString(),
    meta: input.meta,
  });
  list = list.slice(-MAX_EVENTS);
  await prisma.setting.upsert({
    where: { key: FINANCE_EVENTS_SETTING_KEY },
    create: {
      key: FINANCE_EVENTS_SETTING_KEY,
      value: { events: list } as Prisma.InputJsonValue,
    },
    update: {
      value: { events: list } as Prisma.InputJsonValue,
    },
  });
}

export async function listFinanceEvents(take = 30): Promise<FinanceEvent[]> {
  const row = await prisma.setting.findUnique({
    where: { key: FINANCE_EVENTS_SETTING_KEY },
  });
  if (!row?.value || typeof row.value !== "object") return [];
  const events = (row.value as { events?: FinanceEvent[] }).events;
  if (!Array.isArray(events)) return [];
  return events.slice(-take).reverse();
}
