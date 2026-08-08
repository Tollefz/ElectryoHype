import { NextResponse } from "next/server";
import { requireInternalToken } from "@/lib/api-auth";
import { runSupplierWorkers } from "@/lib/suppliers/workers/jobs";

/**
 * Cron / external tick for import_item SupplierJobs.
 * Header: x-internal-token: INTERNAL_CRON_TOKEN
 *
 * Prefer `npm run worker:import` when a dedicated process is available.
 * This endpoint keeps serverless / scheduled environments draining the queue.
 */
export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  try {
    const result = await runSupplierWorkers({
      concurrency: 4,
      limit: 20,
      types: ["import_item"],
    });
    const { unpublishStoreDnaViolations } = await import(
      "@/lib/buyer/unpublish-dna-violations"
    );
    const dnaSweep = await unpublishStoreDnaViolations({ limit: 200 });
    return NextResponse.json({ ok: true, ...result, dnaSweep });
  } catch (error: unknown) {
    console.error("[internal/import-worker]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
