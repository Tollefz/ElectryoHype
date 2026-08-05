import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { conveneCouncil } from "@/lib/council/convene";
import { buildMissionStatusFromSession } from "@/lib/council/mission-status";
import {
  buildCeoDeskStatusFromSession,
  ceoStatusFallback,
} from "@/lib/ceo";

/**
 * Rob CEO — morning brief + Approval Gate (via AI Council).
 * Read-only aggregation. Never executes store actions.
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
      status: buildCeoDeskStatusFromSession(council),
      mission: buildMissionStatusFromSession(council),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: true,
      status: ceoStatusFallback(message),
      mission: null,
    });
  }
}

/**
 * Gate acknowledgements only — no publish / ads / refund / price.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    proposalId?: string;
  };

  if (body.action === "ignore" || body.action === "ack") {
    return NextResponse.json({
      ok: true,
      executed: false,
      message:
        "Notert. Rob utførte ingen butikkhandling — kun foreslått. Du bestemmer.",
      proposalId: body.proposalId || null,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Rob CEO utfører ikke handlinger. Bruk Publiser/Vis detaljer-lenker, eller Ignorer.",
    },
    { status: 400 }
  );
}
