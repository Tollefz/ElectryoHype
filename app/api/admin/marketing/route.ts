import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getMarketingDeskStatus,
  getMarketingDashboard,
  getMarketingInsights,
  getMarketingRecommendations,
  tickMarketingWorker,
  getWeeklyAdSuggestions,
} from "@/lib/marketing";

/**
 * Marketing Brain observation API (Rob's Desk + Mission Control).
 * Read-only by default. POST action=tick is escape hatch (same as Buyer/Order).
 * Never publishes ads or changes budgets.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "desk_status";
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 7)));

  if (view === "dashboard") {
    const dashboard = await getMarketingDashboard(days);
    return NextResponse.json({ ok: true, dashboard });
  }

  if (view === "insights") {
    const insights = await getMarketingInsights(days);
    return NextResponse.json({ ok: true, insights });
  }

  if (view === "recommendations") {
    const recommendations = await getMarketingRecommendations(days);
    return NextResponse.json({ ok: true, recommendations });
  }

  if (view === "ad_suggestions") {
    const adSuggestions = await getWeeklyAdSuggestions(undefined, days);
    return NextResponse.json({ ok: true, adSuggestions });
  }

  if (view === "mission_control") {
    const status = await getMarketingDeskStatus();
    return NextResponse.json({
      ok: true,
      dashboard: status.dashboard,
      insights: status.topInsights,
      recommendations: status.recommendations,
      traffic: status.traffic,
      topProducts: status.topProducts,
      worstProducts: status.worstProducts,
      errors: status.errors,
      lastEventAt: status.lastEventAt,
      lastWorkerTickAt: status.lastWorkerTickAt,
      status: status.status,
      workerStatus: status.workerStatus,
      narrative: status.narrative,
      report: status.report,
      memory: status.memory,
      adSuggestions: status.adSuggestions,
      brain: status.brain,
    });
  }

  const status = await getMarketingDeskStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "tick") {
    const result = await tickMarketingWorker();
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json(
    { ok: false, error: "Unknown action" },
    { status: 400 }
  );
}
