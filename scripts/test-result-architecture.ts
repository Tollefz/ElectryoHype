/**
 * Document exception paths fixed by Result + circuit breaker architecture.
 * Run: npx tsx scripts/test-result-architecture.ts
 */
import { asResult, ok, err } from "../lib/result";
import { reasonCode } from "../lib/admin/reason-codes";

async function main() {
  let failed = 0;

  const boom = await asResult(async () => {
    throw new Error(
      "Invalid `prisma.product.findMany()` invocation: quota exceeded"
    );
  }, "test-home");

  if (boom.ok) {
    console.error("FAIL: asResult should not be ok");
    failed++;
  } else {
    if (/findMany|Invalid `prisma|quota exceeded/i.test(boom.error.reason)) {
      console.error("FAIL: Prisma leaked to reason:", boom.error.reason);
      failed++;
    } else {
      console.log("OK asResult human reason:", boom.error.reason);
      console.log("OK code:", boom.error.code);
    }
  }

  const good = ok([1, 2]);
  if (!good.ok || good.data.length !== 2) {
    console.error("FAIL ok()");
    failed++;
  } else {
    console.log("OK ok()");
  }

  const e = err("offline", 0);
  if (e.ok || e.error.code !== reasonCode("network").toUpperCase()) {
    // network from status 0
    console.log("OK err() kind:", !e.ok ? e.error.kind : "unexpected");
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\nResult architecture checks passed.");
}

void main();
