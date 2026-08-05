/**
 * Unit-style checks for admin error classification (no DB).
 * Run: npx tsx scripts/test-admin-data-errors.ts
 */
import { classifyAdminError } from "../lib/admin/data-errors";

const cases: Array<{ name: string; input: unknown; status?: number; expectKind: string }> = [
  {
    name: "Neon quota",
    input: "Your project has exceeded the data transfer quota",
    expectKind: "quota",
  },
  {
    name: "Prisma findMany",
    input: new Error("Invalid `prisma.product.findMany()` invocation"),
    expectKind: "database",
  },
  {
    name: "Connector",
    input: "Can't reach database server at neon.tech",
    expectKind: "database",
  },
  {
    name: "Timeout",
    input: "Request timed out",
    status: 408,
    expectKind: "timeout",
  },
  {
    name: "Network offline",
    input: "offline",
    status: 0,
    expectKind: "network",
  },
  {
    name: "API 500",
    input: "Internal Server Error",
    status: 500,
    expectKind: "server",
  },
  {
    name: "API 404",
    input: "Not found",
    status: 404,
    expectKind: "not_found",
  },
  {
    name: "Supplier",
    input: "CJ API unavailable",
    status: 502,
    expectKind: "supplier",
  },
];

let failed = 0;
for (const c of cases) {
  const result = classifyAdminError(c.input, c.status);
  const ok = result.kind === c.expectKind;
  const leaks =
    /prisma|findMany|stack|connector|quota exceeded the data/i.test(
      result.reason + result.title
    ) && c.expectKind !== "quota";
  // quota title is human; reason shouldn't include raw neon sentence as sole UI if classified
  if (!ok || (leaks && c.expectKind === "database")) {
    console.error(`FAIL ${c.name}: kind=${result.kind} reason=${result.reason}`);
    failed++;
  } else {
    console.log(`OK   ${c.name}: ${result.title} — ${result.reason}`);
  }
  if (/Invalid `prisma|findMany\(\)|stack trace/i.test(result.reason)) {
    console.error(`LEAK ${c.name}: user-facing reason has technical detail`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll classifyAdminError cases passed.");
