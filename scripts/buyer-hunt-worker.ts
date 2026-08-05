/**
 * Dedicated Buyer Hunt Worker — continuous drain of buyer_scan_batch.
 *
 * Usage (after npm install — no extra tools):
 *   npm run worker:buyer-hunt
 *
 * Runs via ts-node (devDependency) + stub-server-only.cjs preload.
 * Requires DATABASE_URL. Independent of the admin dashboard.
 *
 * Must stay alive for days: unhandled rejections are logged, not fatal.
 */
import { runBuyerHuntWorkerLoop } from "../lib/buyer/buyer-worker";

const ac = new AbortController();

function shutdown(signal: string) {
  console.log(`[buyer-hunt-worker] received ${signal}, shutting down…`);
  ac.abort();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[buyer-hunt-worker] unhandledRejection", err.message);
  if (err.stack) console.error(err.stack);
  // Do not exit — keep draining; rejection is recorded on next tick path when possible
});

process.on("uncaughtException", (err) => {
  console.error("[buyer-hunt-worker] uncaughtException", err.message);
  if (err.stack) console.error(err.stack);
  // Do not exit — loop may still recover; operator sees watchdog if heartbeat dies
});

console.log("Worker started");

runBuyerHuntWorkerLoop({ signal: ac.signal })
  .then(() => {
    console.log("[buyer-hunt-worker] loop ended (signal)");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[buyer-hunt-worker] fatal", err);
    process.exit(1);
  });
