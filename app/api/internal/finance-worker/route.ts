import { NextResponse } from "next/server";
import { requireInternalToken } from "@/lib/api-auth";
import { tickFinanceWorker } from "@/lib/finance/finance-worker";

/**
 * Cron / external tick for Finance Brain Worker.
 * Header: x-internal-token: INTERNAL_CRON_TOKEN
 */
export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  try {
    const result = await tickFinanceWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    console.error("[internal/finance-worker]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
