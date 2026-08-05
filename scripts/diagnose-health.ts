/**
 * Diagnose: DB reality vs health classification.
 * Run: npx tsx scripts/diagnose-health.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    const data = await fn();
    const ms = Date.now() - t0;
    console.log(
      `OK   ${label} (${ms}ms)`,
      typeof data === "object" ? JSON.stringify(data).slice(0, 80) : data
    );
    return { ok: true as const, ms, data };
  } catch (e: unknown) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAIL ${label} (${ms}ms)`);
    console.log(`     RAW: ${msg.slice(0, 500)}`);
    return { ok: false as const, ms, error: msg };
  }
}

async function main() {
  console.log("=== DIRECT PRISMA PROBES ===\n");

  const select1 = await timed("SELECT 1", () => prisma.$queryRaw`SELECT 1`);
  const products = await timed("product.count()", () => prisma.product.count());
  const users = await timed("user.count()", () => prisma.user.count());
  const orders = await timed("order.count()", () => prisma.order.count());
  const queue = await timed("importQueueItem.count()", () =>
    prisma.importQueueItem.count()
  );

  const raced = await timed("Promise.race SELECT1 vs 4s timeout", () =>
    Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 4000)
      ),
    ])
  );

  console.log("\n=== FIXED HEALTH AGGREGATION ===\n");

  const dbStatus = !select1.ok
    ? "down"
    : select1.ms > 2000
      ? "degraded"
      : "ok";
  const queueStatus = !select1.ok
    ? "unknown"
    : queue.ok
      ? "ok"
      : "degraded"; // never "down" for queue alone

  const services = [
    { id: "database", status: dbStatus },
    { id: "queue", status: queueStatus },
    {
      id: "openai",
      status: process.env.OPENAI_API_KEY ? "ok" : "unknown",
    },
    {
      id: "cron",
      status: process.env.INTERNAL_CRON_TOKEN ? "ok" : "unknown",
    },
  ];

  const overall =
    dbStatus === "down"
      ? "down"
      : dbStatus === "degraded" || queueStatus === "degraded"
        ? "degraded"
        : "ok";

  console.log("services:", JSON.stringify(services, null, 2));
  console.log("overall status (fixed):", overall);
  console.log("database field:", dbStatus);
  console.log("raced probe ok:", raced.ok);

  // Fixed preflight: ONLY database
  const preflightBlocks = dbStatus === "down";
  console.log("\nIntelligence healthPreflight would BLOCK:", preflightBlocks);
  console.log("  (only when database===down:", dbStatus === "down", ")");

  if (select1.ok && products.ok && preflightBlocks) {
    console.log(
      "\n*** BUG: DB works but preflight still blocks — fix incomplete ***"
    );
  } else if (!select1.ok) {
    console.log("\n*** DB probe actually failed — see RAW error above ***");
    console.log(
      "    Health correctly reports database=down until Neon/DB recovers."
    );
  } else {
    console.log("\nDB ok and preflight would allow analysis.");
  }

  await prisma.$disconnect().catch(() => undefined);
}

void main();
