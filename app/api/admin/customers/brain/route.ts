import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  advanceCustomerBrain,
  getCustomerDeskStatus,
} from "@/lib/customer";

/**
 * Customer Brain Mission Control API (Rob's Desk).
 * Recommendations only — never sends email.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "desk_status";

  if (view === "brain") {
    const brain = await advanceCustomerBrain();
    return NextResponse.json({
      ok: true,
      mission: brain.mission,
      insights: brain.insights,
      recommendations: brain.recommendations,
      memory: brain.memory,
      profileCount: brain.profiles.length,
    });
  }

  const status = await getCustomerDeskStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "tick") {
    const brain = await advanceCustomerBrain();
    return NextResponse.json({
      ok: true,
      profileCount: brain.profiles.length,
      memoryScore: brain.memory.stats.memoryScore,
      message: `Scorert ${brain.profiles.length} kunder · memory ${brain.memory.stats.memoryScore}/100`,
    });
  }

  return NextResponse.json(
    { ok: false, error: "Unknown action" },
    { status: 400 }
  );
}
