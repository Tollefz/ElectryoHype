/**
 * Continuous Marketing Brain Worker.
 * Prefer this over serverless cron when a process can stay alive.
 *
 * Usage: npm run worker:marketing
 */

import { runMarketingWorkerLoop } from "../lib/marketing/marketing-worker";

const ac = new AbortController();
process.on("SIGINT", () => ac.abort());
process.on("SIGTERM", () => ac.abort());

runMarketingWorkerLoop({
  signal: ac.signal,
  intervalMs: Number(process.env.MARKETING_WORKER_INTERVAL_MS || 60_000),
}).catch((err) => {
  console.error("[marketing-worker] fatal", err);
  process.exit(1);
});
