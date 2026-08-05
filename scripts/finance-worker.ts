/**
 * Continuous Finance Brain Worker.
 * Usage: npm run worker:finance
 */

import { runFinanceWorkerLoop } from "../lib/finance/finance-worker";

const ac = new AbortController();
process.on("SIGINT", () => ac.abort());
process.on("SIGTERM", () => ac.abort());

runFinanceWorkerLoop({
  signal: ac.signal,
  intervalMs: Number(process.env.FINANCE_WORKER_INTERVAL_MS || 300_000),
}).catch((err) => {
  console.error("[finance-worker] fatal", err);
  process.exit(1);
});
