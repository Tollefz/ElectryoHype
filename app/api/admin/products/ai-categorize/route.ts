import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import { AI_CATEGORY_BATCH_SIZE } from "@/lib/admin/ai-categorize-constants";
import {
  categorizeProductsBatch,
} from "@/lib/admin/ai-categorize";
import { logError } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(AI_CATEGORY_BATCH_SIZE),
});

/**
 * POST — categorize one batch (max 20). Client loops for larger selections.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = bodySchema.parse(await req.json());
    const { results, summary } = await categorizeProductsBatch(body.productIds);

    return NextResponse.json({
      ok: true,
      batchSize: body.productIds.length,
      results,
      summary,
      message: `Batch ferdig: ${summary.auto_applied} auto, ${summary.pending_approval} venter, ${summary.needs_review} review`,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Maks ${AI_CATEGORY_BATCH_SIZE} produkter per batch`,
        },
        { status: 400 }
      );
    }
    logError(error, "[ai-categorize POST]");
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "AI-kategorisering feilet",
      },
      { status: 500 }
    );
  }
}
