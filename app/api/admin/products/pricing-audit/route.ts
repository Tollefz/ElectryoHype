import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import {
  applyPricingAuditApprovals,
  getPricingAuditQueue,
  rejectPricingAuditItems,
  runCatalogPricingAudit,
} from "@/lib/ops/catalog-pricing-audit";
import { logError } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const queue = await getPricingAuditQueue();
    return NextResponse.json({ ok: true, queue });
  } catch (error: unknown) {
    logError(error, "[pricing-audit GET]");
    return NextResponse.json({ ok: false, error: "Kunne ikke hente kø" }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({
    action: z.literal("approve"),
    productIds: z.array(z.string()).optional(),
    approveAllPending: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    productIds: z.array(z.string()).min(1),
  }),
]);

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = postSchema.parse(await req.json());

    if (body.action === "run") {
      const storeId = await getStoreIdFromHeadersServer();
      const queue = await runCatalogPricingAudit({ storeId, onlyImported: true });
      return NextResponse.json({
        ok: true,
        queue,
        message: `Audit ferdig: ${queue.summary.changes} endringer i kø, ${queue.summary.fallback105} med ~105-fallback, ${queue.summary.missingCost} mangler kost. Ikke publisert.`,
      });
    }

    if (body.action === "approve") {
      if (!body.approveAllPending && (!body.productIds || body.productIds.length === 0)) {
        return NextResponse.json(
          { ok: false, error: "Velg produkter eller approveAllPending" },
          { status: 400 }
        );
      }
      const result = await applyPricingAuditApprovals({
        productIds: body.productIds,
        approveAllPending: body.approveAllPending === true,
      });
      return NextResponse.json({
        ok: true,
        ...result,
        message: `Publiserte ${result.applied} prisendringer`,
      });
    }

    const rejected = await rejectPricingAuditItems(body.productIds);
    return NextResponse.json({
      ok: true,
      rejected,
      message: `Avviste ${rejected} forslag`,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Pricing audit feilet";
    logError(error, "[pricing-audit POST]");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
