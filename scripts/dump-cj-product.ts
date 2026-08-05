/**
 * Dump raw CJ product.query keys/values for mapping (no secrets).
 * Usage: NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/dump-cj-product.ts [pid]
 */
import "dotenv/config";
import { cjRequest, isCjConfigured } from "../lib/suppliers/cj/api";
import { prisma } from "../lib/prisma";

const PID = process.argv[2] || "1436966941628698624";

function summarize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 120) return `${value.slice(0, 80)}…(len=${value.length})`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (depth >= 2) return `[array:${value.length}]`;
    return value.slice(0, 2).map((v) => summarize(v, depth + 1)).concat(
      value.length > 2 ? [`…(+${value.length - 2})`] : []
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = summarize(v, depth + 1);
  }
  return out;
}

async function main() {
  if (!isCjConfigured()) throw new Error("CJ not configured");

  const features = "enable_combine,enable_video,enable_inventory";
  const data = await cjRequest<Record<string, unknown>>({
    operation: "product.query.dump",
    method: "GET",
    path: "/product/query",
    query: { pid: PID, features },
    cacheTtlMs: 0,
  });

  const keys = Object.keys(data || {}).sort();
  console.log("TOP_LEVEL_KEYS:", keys.join(", "));
  console.log("SUMMARY:", JSON.stringify(summarize(data), null, 2));

  const variants = Array.isArray(data?.variants) ? data.variants : [];
  if (variants[0] && typeof variants[0] === "object") {
    console.log("VARIANT0_KEYS:", Object.keys(variants[0] as object).sort().join(", "));
    console.log("VARIANT0:", JSON.stringify(summarize(variants[0]), null, 2));
  }

  // Also try stock endpoint if documented
  try {
    const stock = await cjRequest<unknown>({
      operation: "product.stock.dump",
      method: "GET",
      path: "/product/stock",
      query: { pid: PID },
      cacheTtlMs: 0,
      retries: 1,
    });
    console.log("STOCK_ENDPOINT:", JSON.stringify(summarize(stock), null, 2));
  } catch (e) {
    console.log("STOCK_ENDPOINT_ERROR:", e instanceof Error ? e.message : e);
  }
}

main()
  .catch((e) => {
    console.error("DUMP_FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
