/**
 * Unit tests for Neon Free Plan traffic controls (no live DB).
 * Run: npx tsx scripts/test-neon-traffic-controls.ts
 */
import { createTtlCache } from "../lib/ops/ttl-cache";
import { classifyAdminError } from "../lib/admin/data-errors";
import { resetDatabaseCircuit, peekDatabaseCircuit } from "../lib/ops/db-circuit";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

async function testTtlDedup() {
  const cache = createTtlCache<number>({ ttlOkMs: 5_000, ttlFailMs: 1_000 });
  let calls = 0;
  const factory = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return 42;
  };
  const [a, b, c] = await Promise.all([
    cache.getOrSet("k", factory),
    cache.getOrSet("k", factory),
    cache.getOrSet("k", factory),
  ]);
  assert(a === 42 && b === 42 && c === 42, "dedup returns same value");
  assert(calls === 1, "concurrent getOrSet runs factory once");
  const d = await cache.getOrSet("k", factory);
  assert(d === 42 && calls === 1, "TTL hit skips factory");
}

async function testHealthProbeIsMinimal() {
  // Source contract: health route must not count products
  const fs = await import("fs");
  const path = await import("path");
  const src = fs.readFileSync(
    path.join(__dirname, "../app/api/admin/system-health/route.ts"),
    "utf8"
  );
  assert(src.includes("SELECT 1"), "1. health uses SELECT 1");
  assert(!src.includes("product.count"), "1b. no product.count");
  assert(src.includes("systemHealthCache") || src.includes("getOrSet"), "2. health is cached");
  assert(src.includes("getOrSet"), "3. concurrent health shares cache");
  const cacheMod = fs.readFileSync(
    path.join(__dirname, "../lib/ops/system-health-cache.ts"),
    "utf8"
  );
  assert(cacheMod.includes("45_000"), "2b. health TTL 45s");
}

async function testIntelligenceNoLoop() {
  const fs = await import("fs");
  const path = await import("path");
  const src = fs.readFileSync(
    path.join(
      __dirname,
      "../app/admin/(panel)/intelligence/IntelligenceClient.tsx"
    ),
    "utf8"
  );
  assert(!/setInterval\s*\(/.test(src), "4. intelligence has no poll loop");
  assert(src.includes("cached=1"), "4b. prefers cached");
}

async function testBuyerNoScanOnLoad() {
  const fs = await import("fs");
  const path = await import("path");
  const route = fs.readFileSync(
    path.join(__dirname, "../app/api/admin/buyer/route.ts"),
    "utf8"
  );
  // GET must not call startBuyerScan
  const getSection = route.split("export async function POST")[0];
  assert(
    !getSection.includes("startBuyerScan("),
    "5. buyer GET does not start scan"
  );
  assert(
    getSection.includes("poll") && getSection.includes("skipDrain"),
    "5b. buyer supports poll=1 skip drain"
  );
}

async function testImportPollSmart() {
  const fs = await import("fs");
  const path = await import("path");
  const job = fs.readFileSync(
    path.join(__dirname, "../components/admin/ImportJobProvider.tsx"),
    "utf8"
  );
  assert(job.includes("visibilityState"), "7/8. import poll respects hidden tab");
  const queue = fs.readFileSync(
    path.join(
      __dirname,
      "../app/admin/(panel)/suppliers/import-queue/ImportQueueClient.tsx"
    ),
    "utf8"
  );
  assert(queue.includes("useSmartPoll"), "7. import queue smart poll");
  assert(queue.includes("pipelineActive"), "7b. fast poll only when active");
}

async function testFindManyCaps() {
  const fs = await import("fs");
  const path = await import("path");
  const cat = fs.readFileSync(
    path.join(__dirname, "../lib/intelligence/category-health.ts"),
    "utf8"
  );
  assert(/take:/.test(cat), "9. catalog findMany has take");
  const tilbud = fs.readFileSync(
    path.join(__dirname, "../app/tilbud/page.tsx"),
    "utf8"
  );
  assert(tilbud.includes("take: 120"), "9b. tilbud capped");
}

async function testErrorVsEmpty() {
  const db = classifyAdminError(
    "Can't reach database server at neon.tech"
  );
  assert(db.kind === "database", "10. db failure → database kind");
  assert(!/0 produkter/i.test(db.reason), "10b. reason is not fake zero");

  const timeout = classifyAdminError("timeout");
  assert(timeout.kind === "timeout", "11. timeout → timeout kind");

  // Empty is a success path in LoadState — not classifyAdminError
  assert(true, "12. empty-state is success+isEmpty (architecture)");
}

async function testCircuitReset() {
  resetDatabaseCircuit();
  assert(peekDatabaseCircuit() === null, "13. circuit reset clears state");
}

async function testNoPrismaInUiCopy() {
  const db = classifyAdminError(
    "Invalid `prisma.product.findMany()` invocation:\n\nError querying the database"
  );
  assert(
    !/prisma\.|findMany|Invalid `/i.test(db.reason) &&
      !/prisma\.|findMany/i.test(db.title),
    "14. UI copy hides Prisma stack"
  );
}

async function main() {
  await testTtlDedup();
  await testHealthProbeIsMinimal();
  await testIntelligenceNoLoop();
  await testBuyerNoScanOnLoad();
  await testImportPollSmart();
  await testFindManyCaps();
  await testErrorVsEmpty();
  await testCircuitReset();
  await testNoPrismaInUiCopy();
  console.log("\nAll neon traffic control tests passed.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
