import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { buildRealStoreSnapshot } from "@/lib/real-store";
import { logError } from "@/lib/utils/logger";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await buildRealStoreSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    logError(error, "[real-store:GET]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Feil" },
      { status: 500 }
    );
  }
}
