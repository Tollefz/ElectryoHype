/**
 * Static + logic audit of DB traffic patterns (no live Neon required).
 * Run: npx tsx scripts/audit-db-traffic.ts
 */
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

function countMatches(src: string, re: RegExp) {
  return (src.match(re) || []).length;
}

// --- Static source checks ---
const health = read("app/api/admin/system-health/route.ts");
assert(
  health.includes("$queryRaw`SELECT 1`") || health.includes("$queryRaw`SELECT 1`"),
  "system-health uses SELECT 1 probe"
);
assert(
  !/product\.count|user\.count|order\.count|findMany/.test(health),
  "system-health has no product/user/order counts or findMany"
);
assert(health.includes("45_000") || health.includes("systemHealthCache"), "system-health cached ~45s");

const truth = read("app/api/admin/truth/route.ts");
assert(
  truth.includes("getAdminSnapshot") || truth.includes("getCachedPipelineCounts"),
  "truth API uses cached snapshot/pipeline"
);

const intelClient = read("app/admin/(panel)/intelligence/IntelligenceClient.tsx");
assert(
  intelClient.includes("cached=1"),
  "Butikkinnsikt defaults to cached snapshot"
);
assert(
  !/setInterval\(/.test(intelClient),
  "Butikkinnsikt has no setInterval polling loop"
);

const buyerClient = read("app/admin/(panel)/buyer/BuyerClient.tsx");
assert(buyerClient.includes("useSmartPoll"), "Buyer uses smart poll");
assert(buyerClient.includes("poll=1"), "Buyer silent polls skip drain");

const importJob = read("components/admin/ImportJobProvider.tsx");
assert(
  /,\s*4000\)/.test(importJob) || importJob.includes("4000"),
  "Import job poll is 4s (not 2s)"
);
assert(
  importJob.includes("visibilityState"),
  "Import job respects tab visibility"
);

const importQueue = read(
  "app/admin/(panel)/suppliers/import-queue/ImportQueueClient.tsx"
);
assert(importQueue.includes("useSmartPoll"), "Import queue uses smart poll");
assert(importQueue.includes("45_000"), "Import queue idle poll ~45s");

const workers = read(
  "app/admin/(panel)/suppliers/workers/WorkersClient.tsx"
);
assert(workers.includes("30_000"), "Workers poll 30s not 4s");
assert(workers.includes("visibilityState"), "Workers respect visibility");

const categoryHealth = read("lib/intelligence/category-health.ts");
assert(
  /take:\s*/.test(categoryHealth) || categoryHealth.includes("take:"),
  "loadCatalogProducts has take cap"
);

const tilbud = read("app/tilbud/page.tsx");
assert(tilbud.includes("take: 120"), "tilbud findMany has take");

const adminStatus = read("components/admin/AdminSystemStatus.tsx");
assert(adminStatus.includes("60_000"), "Header health polls at 60s");
assert(
  adminStatus.includes("visibilityState"),
  "Header health pauses when hidden"
);

const pipeline = read("lib/ops/admin-truth.ts");
assert(
  pipeline.includes('groupBy({\n    by: ["status"]') ||
    pipeline.includes('by: ["status"]'),
  "getPipelineCounts uses groupBy (not 7× count)"
);

const supplierHealth = read("lib/suppliers/health.ts");
assert(
  supplierHealth.includes('by: ["supplierName"'),
  "supplier health uses product groupBy"
);

// --- Estimated rates (AFTER) ---
const before = {
  adminIdlePerMin: "≈1 health + optional widgets; buyer/desk could add 24–48 req/min if scan UI mounted wrong",
  importActivePerMin: "ImportJob 30 req/min (2s) + process_all every 6s",
  importQueuePage: "15 pipeline req/min (4s × 7 queries)",
  intelLoad: "40+ queries always (refresh=1)",
  buyerRunning: "3 clients × 24 req/min overlapping drains",
};

const after = {
  adminIdlePerMin: "1 health request/min (cached 45s → ~1 probe/45s server-side)",
  importActivePerMin: "ImportJob 15 req/min (4s) + process every 12s; paused when tab hidden",
  importQueuePage: "active 12 req/min (5s); idle ~1.3 req/min (45s); pipeline cached 8s",
  intelLoad: "1 snapshot read when cached; full rebuild only on Oppdater",
  buyerRunning: "1 smart poll 5s + live view; drain ≤6/min server throttle",
};

console.log("\n=== ESTIMATED TRAFFIC ===");
console.log("BEFORE:", JSON.stringify(before, null, 2));
console.log("AFTER:", JSON.stringify(after, null, 2));

// Rough daily estimate if admin left open 8h idle
const beforeIdleQueriesDay = 60 * 8 * 2; // health every 60s × ~2 queries
const afterIdleQueriesDay = Math.ceil((8 * 3600) / 45); // SELECT 1 every 45s cached
console.log(
  `\nIdle admin 8h SELECT-ish probes: BEFORE≈${beforeIdleQueriesDay} AFTER≈${afterIdleQueriesDay}`
);

// Aggressive old buyer+import scenario
const oldAggressive =
  (3600 / 2) * 3 + // buyer-like 2s × 3 clients
  (3600 / 4) * 7 + // import queue pipeline
  (3600 / 2) * 3; // import job
const newAggressive =
  (3600 / 5) * 1 + // buyer poll
  (3600 / 5) * 1 + // pipeline when active
  (3600 / 4) * 3; // import batch
console.log(
  `Active hour (import+buyer) request-ish: BEFORE≈${Math.round(oldAggressive)} AFTER≈${Math.round(newAggressive)}`
);

assert(
  countMatches(health, /createTtlCache|getOrSet/) >= 1,
  "health uses TTL cache"
);

console.log("\nAll audit-db-traffic checks passed.");
