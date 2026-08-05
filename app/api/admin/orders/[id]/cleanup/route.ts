import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  archiveOrder,
  restoreOrder,
  setTestOrderFlag,
  deleteTestOrder,
  permanentDeleteOrder,
} from "@/lib/ops/order-cleanup";
import { logError } from "@/lib/utils/logger";

const bodySchema = z.object({
  action: z.enum([
    "archive",
    "restore",
    "mark_test",
    "unmark_test",
    "delete_test",
    "permanent_delete",
  ]),
  confirmation: z.string().optional(),
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Mangler ordre-id" }, { status: 400 });
  }

  try {
    const body = bodySchema.parse(await req.json());

    switch (body.action) {
      case "archive": {
        const order = await archiveOrder({
          orderId: id,
          adminId: auth.userId,
          adminEmail: auth.email,
        });
        return NextResponse.json({
          ok: true,
          action: "archive",
          archivedAt: order.archivedAt,
          message: "Ordre arkivert (skjult fra standardlister, kan gjenopprettes)",
        });
      }
      case "restore": {
        const order = await restoreOrder(id);
        return NextResponse.json({
          ok: true,
          action: "restore",
          archivedAt: order.archivedAt,
          message: "Ordre gjenopprettet",
        });
      }
      case "mark_test": {
        const order = await setTestOrderFlag(id, true);
        return NextResponse.json({
          ok: true,
          action: "mark_test",
          isTestOrder: order.isTestOrder,
          message: "Ordre markert som testordre",
        });
      }
      case "unmark_test": {
        const order = await setTestOrderFlag(id, false);
        return NextResponse.json({
          ok: true,
          action: "unmark_test",
          isTestOrder: order.isTestOrder,
          message: "Testmarkering fjernet",
        });
      }
      case "delete_test": {
        const result = await deleteTestOrder({
          orderId: id,
          adminId: auth.userId,
          adminEmail: auth.email,
          reason: body.reason,
        });
        return NextResponse.json({
          ok: true,
          action: "delete_test",
          ...result,
          message: `Testordre ${result.orderNumber} slettet`,
        });
      }
      case "permanent_delete": {
        const result = await permanentDeleteOrder({
          orderId: id,
          adminId: auth.userId,
          adminEmail: auth.email,
          confirmation: body.confirmation || "",
          reason: body.reason,
        });
        return NextResponse.json({
          ok: true,
          action: "permanent_delete",
          ...result,
          message: `Ordre ${result.orderNumber} permanent slettet`,
        });
      }
      default:
        return NextResponse.json({ ok: false, error: "Ukjent handling" }, { status: 400 });
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Handling feilet";
    const status =
      message.includes("kan ikke slettes") ||
      message.includes("Kun ubetalte") ||
      message.includes("Bekreftelse")
        ? 403
        : 500;
    if (status === 500) logError(error, "[api/admin/orders/cleanup]");
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
