/**
 * Prove health aggregation rules without HTTP/auth.
 * Run: npx tsx scripts/prove-health-aggregation.ts
 */

type S = "ok" | "degraded" | "down" | "unknown";

function overall(database: S, secondaries: S[]): "ok" | "degraded" | "down" {
  if (database === "down") return "down";
  if (database === "degraded" || secondaries.some((s) => s === "degraded"))
    return "degraded";
  return "ok";
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

assert(
  overall("ok", ["ok", "unknown", "unknown"]) === "ok",
  "DB ok + missing openai/cron → ok (not degraded)"
);
assert(
  overall("ok", ["degraded"]) === "degraded",
  "DB ok + queue fail → degraded (not down)"
);
assert(
  overall("down", ["unknown"]) === "down",
  "DB down → down"
);
assert(
  overall("degraded", ["ok"]) === "degraded",
  "DB slow → degraded"
);

// Preflight rule
function preflightBlocks(database: S, overallStatus: string) {
  // FIXED: only database, ignore overall
  return database === "down";
}
assert(
  preflightBlocks("ok", "down") === false,
  "preflight ignores overall=down when database=ok"
);
assert(
  preflightBlocks("down", "down") === true,
  "preflight blocks when database=down"
);

console.log("\nAll aggregation proofs passed.");
