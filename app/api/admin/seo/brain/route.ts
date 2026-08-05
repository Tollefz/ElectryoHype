import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { advanceSeoBrain, getSeoDeskStatus } from "@/lib/seo-brain";

/**
 * SEO Brain observation API (Rob's Desk).
 * Never auto-generates content.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "desk_status";

  if (view === "brain") {
    const brain = await advanceSeoBrain();
    return NextResponse.json({
      ok: true,
      seoScore: brain.seoScore,
      summary: brain.summary,
      insights: brain.insights,
      warnings: brain.warnings,
      opportunities: brain.opportunities,
      structure: brain.structure,
    });
  }

  const status = await getSeoDeskStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "tick") {
    const brain = await advanceSeoBrain();
    return NextResponse.json({
      ok: true,
      seoScore: brain.seoScore,
      productCount: brain.summary.productCount,
      message: `SEO Score ${brain.seoScore}/100 · ${brain.summary.criticalCount} kritiske`,
    });
  }

  return NextResponse.json(
    { ok: false, error: "Unknown action" },
    { status: 400 }
  );
}
