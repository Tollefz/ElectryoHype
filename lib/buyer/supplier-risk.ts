/**
 * Supplier Risk — price volatility observations.
 * Persists lightweight counters in Setting so AI prefers stable suppliers.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

const SETTING_KEY = "buyer_supplier_price_obs";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type PriceObservation = {
  supplier: string;
  productKey: string;
  price: number;
  at: string;
};

type ObsStore = {
  events: PriceObservation[];
};

async function loadStore(): Promise<ObsStore> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    const v = row?.value;
    if (v && typeof v === "object" && Array.isArray((v as ObsStore).events)) {
      return v as ObsStore;
    }
  } catch {
    /* ignore */
  }
  return { events: [] };
}

async function saveStore(store: ObsStore): Promise<void> {
  const trimmed = {
    events: store.events
      .filter((e) => Date.now() - new Date(e.at).getTime() < WEEK_MS * 2)
      .slice(-2000),
  };
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: trimmed },
    update: { value: trimmed },
  });
}

/** Record a live price sighting; counts as change if differs from last. */
export async function recordSupplierPriceSighting(input: {
  supplier: string;
  productId: string;
  price: number;
}): Promise<{ changed: boolean; changes7d: number }> {
  const store = await loadStore();
  const key = `${input.supplier}:${input.productId}`;
  const prev = [...store.events]
    .reverse()
    .find((e) => e.productKey === key);
  const changed =
    prev != null &&
    Number.isFinite(prev.price) &&
    Math.abs(prev.price - input.price) / Math.max(prev.price, 0.01) >= 0.01;

  store.events.push({
    supplier: input.supplier,
    productKey: key,
    price: input.price,
    at: new Date().toISOString(),
  });
  await saveStore(store).catch(() => undefined);

  const since = Date.now() - WEEK_MS;
  const changes7d = store.events.filter((e) => {
    if (e.productKey !== key) return false;
    if (new Date(e.at).getTime() < since) return false;
    return true;
  }).length;

  // Approximate changes = consecutive differing prices
  let diffs = 0;
  const productEvents = store.events
    .filter((e) => e.productKey === key && new Date(e.at).getTime() >= since)
    .sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < productEvents.length; i++) {
    if (
      Math.abs(productEvents[i].price - productEvents[i - 1].price) /
        Math.max(productEvents[i - 1].price, 0.01) >=
      0.01
    ) {
      diffs += 1;
    }
  }

  return { changed, changes7d: Math.max(diffs, changed ? 1 : 0) };
}

export async function getSupplierPriceChangeCount(input: {
  supplier: string;
  productId?: string | null;
}): Promise<number> {
  const store = await loadStore();
  const since = Date.now() - WEEK_MS;
  const prefix = `${input.supplier}:`;
  const events = store.events
    .filter((e) => {
      if (new Date(e.at).getTime() < since) return false;
      if (input.productId) return e.productKey === `${input.supplier}:${input.productId}`;
      return e.productKey.startsWith(prefix);
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  if (input.productId) {
    let diffs = 0;
    for (let i = 1; i < events.length; i++) {
      if (
        Math.abs(events[i].price - events[i - 1].price) /
          Math.max(events[i - 1].price, 0.01) >=
        0.01
      ) {
        diffs += 1;
      }
    }
    return diffs;
  }

  // Supplier-level: count product keys with ≥1 change
  const byKey = new Map<string, number[]>();
  for (const e of events) {
    const list = byKey.get(e.productKey) || [];
    list.push(e.price);
    byKey.set(e.productKey, list);
  }
  let total = 0;
  for (const prices of byKey.values()) {
    for (let i = 1; i < prices.length; i++) {
      if (
        Math.abs(prices[i] - prices[i - 1]) / Math.max(prices[i - 1], 0.01) >=
        0.01
      ) {
        total += 1;
      }
    }
  }
  return total;
}

/** Sync heuristic when DB not available — used by merch-brain. */
export function supplierRiskFromChanges(changes7d: number): number {
  if (changes7d >= 9) return 82;
  if (changes7d >= 6) return 65;
  if (changes7d >= 3) return 40;
  if (changes7d >= 1) return 18;
  return 5;
}
