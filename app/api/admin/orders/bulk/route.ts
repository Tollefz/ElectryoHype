import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FulfillmentStatus, OrderStatus } from "@prisma/client";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  archiveOrder,
  bulkDeleteOrders,
  setTestOrderFlag,
} from "@/lib/ops/order-cleanup";
import { logError } from "@/lib/utils/logger";

const postBodySchema = z.object({
  action: z.enum(["mark_ordered", "mark_shipped", "archive", "mark_test", "unmark_test"]),
  /** If omitted, applies to all matching paid+NEW for mark_ordered */
  ids: z.array(z.string()).optional(),
});

const deleteBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * Bulk fulfillment / cleanup so Rob never clicks the same button N times.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const parsed = postBodySchema.parse(await req.json());
    let ids = parsed.ids?.filter(Boolean) || [];

    if (parsed.action === "mark_ordered" && ids.length === 0) {
      const paidNew = await prisma.order.findMany({
        where: { paymentStatus: "paid", fulfillmentStatus: "NEW", archivedAt: null },
        select: { id: true },
        take: 200,
      });
      ids = paidNew.map((o) => o.id);
    }

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "Ingenting å oppdatere" });
    }

    if (ids.length > 200) {
      return NextResponse.json({ ok: false, error: "Maks 200 ordrer per bulk" }, { status: 400 });
    }

    if (parsed.action === "archive") {
      let updated = 0;
      for (const id of ids) {
        await archiveOrder({
          orderId: id,
          adminId: auth.userId,
          adminEmail: auth.email,
        });
        updated += 1;
      }
      return NextResponse.json({
        ok: true,
        updated,
        action: "archive",
        message: `${updated} ordre arkivert`,
      });
    }

    if (parsed.action === "mark_test" || parsed.action === "unmark_test") {
      const isTest = parsed.action === "mark_test";
      let updated = 0;
      for (const id of ids) {
        await setTestOrderFlag(id, isTest);
        updated += 1;
      }
      return NextResponse.json({
        ok: true,
        updated,
        action: parsed.action,
        message: isTest
          ? `${updated} ordre markert som testordre`
          : `Testmerking fjernet for ${updated} ordre`,
      });
    }

    const fulfillmentStatus: FulfillmentStatus =
      parsed.action === "mark_ordered" ? "ORDERED_FROM_SUPPLIER" : "SHIPPED";
    const legacyStatus: OrderStatus =
      parsed.action === "mark_ordered" ? "processing" : "shipped";

    const result = await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: {
        fulfillmentStatus,
        status: legacyStatus,
        ...(parsed.action === "mark_ordered"
          ? { supplierOrderStatus: "SENT_TO_SUPPLIER" as const }
          : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      updated: result.count,
      action: parsed.action,
      message:
        parsed.action === "mark_ordered"
          ? `${result.count} ordre markert som bestilt hos leverandør`
          : `${result.count} ordre markert som sendt`,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[admin:orders:bulk:post]");
    return NextResponse.json({ ok: false, error: "Bulk-oppdatering feilet" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/orders/bulk
 * Body: { ids: string[] }
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const parsed = deleteBodySchema.parse(await req.json());
    const result = await bulkDeleteOrders({
      ids: parsed.ids,
      adminId: auth.userId,
      adminEmail: auth.email,
      reason: "Bulk-sletting fra /admin/orders",
    });

    const parts: string[] = [];
    if (result.deleted > 0) {
      parts.push(
        `${result.deleted} ordre slettet`
      );
    }
    if (result.blocked > 0) {
      parts.push(
        `${result.blocked} ordre kunne ikke slettes fordi de allerede er i produksjon.`
      );
    }
    if (result.missing > 0) {
      parts.push(`${result.missing} ordre ble ikke funnet`);
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      blocked: result.blocked,
      missing: result.missing,
      deletedIds: result.deletedIds,
      blockedIds: result.blockedIds,
      message: parts.join(" ") || "Ingen endringer",
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[admin:orders:bulk:delete]");
    return NextResponse.json({ ok: false, error: "Bulk-sletting feilet" }, { status: 500 });
  }
}
