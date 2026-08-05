import { NextResponse } from "next/server";
import { requireInternalToken } from "@/lib/api-auth";
import { tickMarketingWorker } from "@/lib/marketing/marketing-worker";

/**
 * Cron / external tick for Marketing Brain Worker.
 * Header: x-internal-token: INTERNAL_CRON_TOKEN
 *
 * Prefer `npm run worker:marketing` when a dedicated process is available.
 */
export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  try {
    const result = await tickMarketingWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    console.error("[internal/marketing-worker]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
