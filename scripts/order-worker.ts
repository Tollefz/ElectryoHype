/**
 * Dedicated Order Automation Worker process.
 * Usage: npm run worker:order
 */

import { runOrderWorkerLoop } from "../lib/orders/order-worker";

console.log("[order-worker] starting loop…");
runOrderWorkerLoop({ intervalMs: 15_000, batchSize: 8 }).catch((err) => {
  console.error("[order-worker] fatal", err);
  process.exit(1);
});
