/**
 * Smoke checks: classification never leaks Prisma to UI; reason codes stable.
 * Run: npx tsx scripts/test-admin-exception-safe.ts
 */
import { classifyAdminError } from "../lib/admin/data-errors";
import { reasonCode, adminHttpStatus } from "../lib/admin/reason-codes";
import { safeQueryResult, safeSync } from "../lib/admin/safe-result";

async function main() {
  let failed = 0;

  const prismaMsg =
    "Invalid `prisma.product.findMany()` invocation:\n\nYour project has exceeded the data transfer quota";
  const c = classifyAdminError(prismaMsg);
  if (/findMany|Invalid `prisma|stack/i.test(c.reason + c.title)) {
    console.error("LEAK in classifyAdminError UI fields");
    failed++;
  } else {
    console.log("OK classify no leak:", c.kind, reasonCode(c.kind));
  }
  if (adminHttpStatus(c.kind) !== 503) {
    console.error("Expected 503 for quota/db, got", adminHttpStatus(c.kind));
    failed++;
  } else {
    console.log("OK http status 503");
  }

  const boom = await safeQueryResult(async () => {
    throw new Error("Can't reach database server at neon.tech");
  }, "test");
  if (boom.ok) {
    console.error("safeQueryResult should fail");
    failed++;
  } else {
    console.log("OK safeQueryResult swallowed throw:", boom.reasonCode);
  }

  const sync = safeSync(() => {
    throw new Error("Failed to run query");
  }, "test-sync");
  if (sync.ok) {
    console.error("safeSync should fail");
    failed++;
  } else {
    console.log("OK safeSync swallowed throw");
  }

  const ok = await safeQueryResult(async () => [1, 2, 3], "ok");
  if (!ok.ok || ok.data?.length !== 3) {
    console.error("safeQueryResult success broken");
    failed++;
  } else {
    console.log("OK safeQueryResult success");
  }

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nException-safe core passed.");
}

void main();
