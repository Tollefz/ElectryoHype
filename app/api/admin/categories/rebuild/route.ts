import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { rebuildCategories } from "@/lib/categories/rebuild";
import { logError } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/categories/rebuild
 * Body: { storeId?: string, force?: boolean, limit?: number }
 */
export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const storeId =
      typeof body.storeId === "string" && body.storeId.trim()
        ? body.storeId.trim()
        : undefined;
    const force = Boolean(body.force);
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(body.limit, 2000)
        : undefined;

    const report = await rebuildCategories({ storeId, force, limit });

    return NextResponse.json({
      ok: true,
      report,
      message: `Rebuild ferdig: ${report.processed} analysert, ${report.applied} oppdatert, ${report.needsReview} til review, ${report.orphansFixed} orphan-fikset.`,
    });
  } catch (error) {
    logError(error, "[api/admin/categories/rebuild]");
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Rebuild feilet",
      },
      { status: 500 }
    );
  }
}
