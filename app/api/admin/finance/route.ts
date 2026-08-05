import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getFinanceDeskStatus,
  getFinanceDashboard,
  getFinanceInsights,
  getFinanceRecommendations,
  tickFinanceWorker,
} from "@/lib/finance";

/**
 * Finance Brain observation API (Rob's Desk).
 * Never changes prices.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "desk_status";
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 30)));

  if (view === "dashboard") {
    const dashboard = await getFinanceDashboard(days);
    return NextResponse.json({ ok: true, dashboard });
  }
  if (view === "insights") {
    const insights = await getFinanceInsights(days);
    return NextResponse.json({ ok: true, insights });
  }
  if (view === "recommendations") {
    const recommendations = await getFinanceRecommendations(days);
    return NextResponse.json({ ok: true, recommendations });
  }

  const status = await getFinanceDeskStatus(undefined, days);
  return NextResponse.json({ ok: true, status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "tick") {
    const result = await tickFinanceWorker();
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json(
    { ok: false, error: "Unknown action" },
    { status: 400 }
  );
}
