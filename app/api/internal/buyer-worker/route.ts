import { NextResponse } from "next/server";
import { requireInternalToken } from "@/lib/api-auth";
import { tickBuyerHuntWorker } from "@/lib/buyer/buyer-worker";

/**
 * Cron / external tick for Buyer Hunt Worker.
 * Header: x-internal-token: INTERNAL_CRON_TOKEN
 *
 * Prefer the dedicated process (`npm run worker:buyer-hunt`) when available.
 * This endpoint keeps serverless / scheduled environments draining the queue.
 */
export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  try {
    const result = await tickBuyerHuntWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    console.error("[internal/buyer-worker]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
