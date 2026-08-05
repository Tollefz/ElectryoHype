import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import {
  getBatchProgress,
  buildEvidenceMorningBrief,
} from "@/lib/ops/admin-truth";
import {
  getAdminSnapshot,
  getCachedPipelineCounts,
} from "@/lib/ops/admin-snapshot";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { adminErrorResponse } from "@/lib/admin/api-error";
import { beginDbRoute } from "@/lib/db/query-metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/truth
 * ?scope=pipeline|full|batch
 * ?ids=id1,id2  (batch progress for import workflow)
 */
export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const end = beginDbRoute("/api/admin/truth");
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "full";
  const idsRaw = searchParams.get("ids");
  const ids = idsRaw
    ? idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5000)
    : [];

  try {
    if (scope === "batch" || ids.length > 0) {
      const progress = await getBatchProgress(ids);
      return NextResponse.json({ ok: true, progress });
    }

    if (scope === "pipeline") {
      const pipeline = await getCachedPipelineCounts();
      return NextResponse.json({
        ok: true,
        pipeline,
        generatedAt: new Date().toISOString(),
      });
    }

    const truth = await getAdminSnapshot({ storeId: DEFAULT_STORE_ID });
    const evidenceBrief = buildEvidenceMorningBrief(truth);

    return NextResponse.json({
      ok: true,
      truth,
      evidenceBrief,
      fromCache: truth.fromCache,
    });
  } catch (error: unknown) {
    return adminErrorResponse(error, 500, "truth:GET");
  } finally {
    end();
  }
}
