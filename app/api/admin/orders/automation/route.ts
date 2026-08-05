import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getOrderAutomationDeskStatus,
  getOrderBrainDeskStatus,
  tickOrderWorker,
  advanceOrderBrain,
} from "@/lib/orders";
import { listOrderEvents } from "@/lib/orders/order-events";
import { phaseLabelNb } from "@/lib/orders/order-state-machine";

/**
 * Observation API for Order Automation + Order Brain (Rob's Desk).
 * GET is read-only. POST action=tick / brain_tick are escape hatches.
 * Never auto-refunds or decides for customers.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "desk_status";
  const orderId = url.searchParams.get("orderId");

  if (view === "events" && orderId) {
    const events = await listOrderEvents(orderId, 100);
    return NextResponse.json({
      ok: true,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        phase: e.phase,
        phaseLabel: e.phase ? phaseLabelNb(e.phase) : null,
        createdAt: e.createdAt.toISOString(),
        meta: e.meta,
      })),
    });
  }

  if (view === "brain") {
    const status = await getOrderBrainDeskStatus();
    return NextResponse.json({ ok: true, status });
  }

  const status = await getOrderAutomationDeskStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "tick") {
    const result = await tickOrderWorker();
    return NextResponse.json({ ok: true, ...result });
  }
  if (body.action === "brain_tick") {
    const result = await advanceOrderBrain();
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json(
    { ok: false, error: "Unknown action" },
    { status: 400 }
  );
}
