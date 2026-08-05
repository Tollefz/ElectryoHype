import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { conveneCouncil } from "@/lib/council/convene";
import { buildMissionStatusFromSession } from "@/lib/council/mission-status";
import { buildCeoDeskStatusFromSession, ceoStatusFallback } from "@/lib/ceo";

/**
 * AI Council — single convene for Mission Control + Rob CEO brief.
 * Read-only. Never executes store actions.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const council = await conveneCouncil();
    return NextResponse.json({
      ok: true,
      mission: buildMissionStatusFromSession(council),
      ceo: buildCeoDeskStatusFromSession(council),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: true,
      mission: null,
      ceo: ceoStatusFallback(message),
      error: message,
    });
  }
}
