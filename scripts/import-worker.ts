/**
 * Dedicated Import Worker — continuous drain of import_item SupplierJobs.
 *
 * Usage:
 *   npm run worker:import
 *
 * Requires DATABASE_URL. Independent of the admin dashboard.
 */
import { runSupplierWorkers } from "../lib/suppliers/workers/jobs";

const SLEEP_MS = 5_000;
const ac = new AbortController();

function shutdown(signal: string) {
  console.log(`[import-worker] received ${signal}, shutting down…`);
  ac.abort();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[import-worker] unhandledRejection", err.message);
});

process.on("uncaughtException", (err) => {
  console.error("[import-worker] uncaughtException", err.message);
});

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });
}

async function loop() {
  console.log("Worker started (import_item)");
  while (!ac.signal.aborted) {
    try {
      const result = await runSupplierWorkers({
        concurrency: 4,
        limit: 20,
        types: ["import_item"],
      });
      const claimed = (result as { claimed?: number })?.claimed ?? 0;
      if (claimed > 0) {
        console.log(`[import-worker] drained claimed=${claimed}`, result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[import-worker] tick failed", message);
    }
    await sleep(SLEEP_MS, ac.signal);
  }
}

loop()
  .then(() => {
    console.log("[import-worker] loop ended");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[import-worker] fatal", err);
    process.exit(1);
  });
