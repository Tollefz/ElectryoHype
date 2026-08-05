import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  cleanObviousTestOrders,
  findObviousTestOrders,
} from "@/lib/ops/order-cleanup";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { logError } from "@/lib/utils/logger";

const bodySchema = z.object({
  confirm: z.literal(true),
});

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const storeId = await getStoreIdFromHeadersServer();
    const matches = await findObviousTestOrders(storeId);
    return NextResponse.json({
      ok: true,
      count: matches.length,
      orders: matches.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        paymentStatus: o.paymentStatus,
        isTestOrder: o.isTestOrder,
        customerEmail: o.customerEmail || o.customer?.email || null,
        total: o.total,
      })),
    });
  } catch (error: unknown) {
    logError(error, "[api/admin/orders/clean-test GET]");
    return NextResponse.json({ ok: false, error: "Kunne ikke hente testordre" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    bodySchema.parse(await req.json());
    const storeId = await getStoreIdFromHeadersServer();
    const result = await cleanObviousTestOrders({
      storeId,
      adminId: auth.userId,
      adminEmail: auth.email,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Slettet ${result.deleted} av ${result.matched} testordre`,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Bekreftelse mangler (confirm: true)" },
        { status: 400 }
      );
    }
    logError(error, "[api/admin/orders/clean-test POST]");
    return NextResponse.json({ ok: false, error: "Opprydding feilet" }, { status: 500 });
  }
}
