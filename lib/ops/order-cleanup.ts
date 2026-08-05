import { prisma } from "@/lib/prisma";
import type {
  FulfillmentStatus,
  Order,
  PaymentStatus,
  Prisma,
  SupplierOrderStatus,
} from "@prisma/client";

export type OrderCleanupFields = Pick<
  Order,
  | "id"
  | "orderNumber"
  | "paymentStatus"
  | "isTestOrder"
  | "customerEmail"
  | "internalNotes"
  | "items"
  | "total"
  | "storeId"
  | "archivedAt"
  | "fulfillmentStatus"
  | "supplierOrderStatus"
  | "createdAt"
> & {
  customer?: { email?: string | null; name?: string | null } | null;
};

/** Paid production orders must never be hard-deleted. */
export function canHardDeleteOrder(order: {
  paymentStatus: PaymentStatus;
  isTestOrder: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (order.paymentStatus === "paid" && !order.isTestOrder) {
    return {
      ok: false,
      reason:
        "Betalte produksjonsordrer kan ikke slettes. Arkiver dem, eller marker eksplisitt som testordre først.",
    };
  }
  return { ok: true };
}

/**
 * Bulk-delete rules for /admin/orders cleanup.
 * Allow: test, unpaid, cancelled, archived.
 * Block: paid production, sent to supplier, shipped (unless allowed above).
 */
export function canBulkDeleteOrder(order: {
  paymentStatus: PaymentStatus;
  isTestOrder: boolean;
  fulfillmentStatus: FulfillmentStatus;
  archivedAt: Date | null;
  supplierOrderStatus?: SupplierOrderStatus | null;
}): { ok: true } | { ok: false; reason: string } {
  if (order.isTestOrder) return { ok: true };
  if (order.fulfillmentStatus === "CANCELLED") return { ok: true };
  if (order.archivedAt) return { ok: true };

  const shipped =
    order.fulfillmentStatus === "SHIPPED" ||
    order.fulfillmentStatus === "DELIVERED";
  if (shipped) {
    return { ok: false, reason: "ordre er sendt / levert" };
  }

  const sentToSupplier =
    order.fulfillmentStatus === "ORDERED_FROM_SUPPLIER" ||
    order.supplierOrderStatus === "SENT_TO_SUPPLIER" ||
    order.supplierOrderStatus === "ACCEPTED_BY_SUPPLIER" ||
    order.supplierOrderStatus === "SHIPPED" ||
    order.supplierOrderStatus === "DELIVERED";
  if (sentToSupplier) {
    return { ok: false, reason: "ordre er sendt leverandør" };
  }

  if (order.paymentStatus !== "paid") return { ok: true };

  return {
    ok: false,
    reason: "betalt produksjonsordre",
  };
}

/** Delete-test path: unpaid/failed/refunded/pending OR explicitly marked test. */
export function canDeleteAsTestOrder(order: {
  paymentStatus: PaymentStatus;
  isTestOrder: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (order.isTestOrder) return { ok: true };
  if (order.paymentStatus !== "paid") return { ok: true };
  return {
    ok: false,
    reason:
      "Kun ubetalte/feilede/refunderte ordre, eller ordre markert som test, kan slettes som testordre.",
  };
}

function textLooksLikeTest(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return (
    /\btest\b/.test(v) ||
    v.includes("testkunde") ||
    v.includes("dummy") ||
    v.includes("fake order") ||
    v.includes("testordre") ||
    v.includes("[test]") ||
    v.includes("dev order")
  );
}

function emailLooksLikeTest(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return (
    e.endsWith("@example.com") ||
    e.endsWith("@test.com") ||
    e.endsWith(".test") ||
    e.includes("+test@") ||
    e.startsWith("test@") ||
    e.includes("@localhost") ||
    /@mailinator\.|@guerrillamail\.|@tempmail\./.test(e)
  );
}

function itemsLookLikeTest(items: unknown): boolean {
  try {
    const raw =
      typeof items === "string" ? (JSON.parse(items) as unknown) : items;
    if (!Array.isArray(raw)) return false;
    return raw.some((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.productName ?? "").toLowerCase();
      return name.includes("testprodukt") || /\btest\b/.test(name);
    });
  } catch {
    return false;
  }
}

/**
 * Heuristic for Rob's Desk "Clean test orders".
 * Never treats a paid non-test order as cleanable.
 */
export function isObviousTestOrder(order: OrderCleanupFields): boolean {
  if (!canHardDeleteOrder(order).ok) return false;
  if (order.isTestOrder) return true;

  const email = order.customerEmail || order.customer?.email || null;
  const name = order.customer?.name || null;

  return (
    emailLooksLikeTest(email) ||
    textLooksLikeTest(name) ||
    textLooksLikeTest(order.internalNotes) ||
    textLooksLikeTest(order.orderNumber) ||
    itemsLookLikeTest(order.items)
  );
}

export const activeOrderWhere: Prisma.OrderWhereInput = {
  archivedAt: null,
};

export async function archiveOrder(params: {
  orderId: string;
  adminId: string;
  adminEmail: string | null;
}) {
  const order = await prisma.order.findUnique({ where: { id: params.orderId } });
  if (!order) throw new Error("Ordre ikke funnet");
  if (order.archivedAt) return order;

  return prisma.order.update({
    where: { id: params.orderId },
    data: {
      archivedAt: new Date(),
      archivedById: params.adminId,
      archivedByEmail: params.adminEmail,
    },
  });
}

export async function restoreOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Ordre ikke funnet");
  if (!order.archivedAt) return order;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      archivedAt: null,
      archivedById: null,
      archivedByEmail: null,
    },
  });
}

export async function setTestOrderFlag(orderId: string, isTestOrder: boolean) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Ordre ikke funnet");
  return prisma.order.update({
    where: { id: orderId },
    data: { isTestOrder },
  });
}

type DeletionType = "test" | "permanent" | "clean_test" | "bulk";

async function hardDeleteOrder(params: {
  order: OrderCleanupFields;
  deletionType: DeletionType;
  adminId: string;
  adminEmail: string | null;
  reason?: string | null;
}) {
  if (params.deletionType === "bulk") {
    const bulkGuard = canBulkDeleteOrder(params.order);
    if (!bulkGuard.ok) throw new Error(bulkGuard.reason);
  } else {
    const guard = canHardDeleteOrder(params.order);
    if (!guard.ok) throw new Error(guard.reason);

    if (params.deletionType === "test" || params.deletionType === "clean_test") {
      const testGuard = canDeleteAsTestOrder(params.order);
      if (!testGuard.ok) throw new Error(testGuard.reason);
    }
  }

  const snapshot: Prisma.InputJsonValue = {
    orderNumber: params.order.orderNumber,
    paymentStatus: params.order.paymentStatus,
    total: params.order.total,
    customerEmail: params.order.customerEmail,
    storeId: params.order.storeId,
    isTestOrder: params.order.isTestOrder,
    archivedAt: params.order.archivedAt
      ? params.order.archivedAt.toISOString()
      : null,
    fulfillmentStatus: params.order.fulfillmentStatus,
    createdAt: params.order.createdAt.toISOString(),
  };

  await prisma.$transaction([
    prisma.orderDeletionLog.create({
      data: {
        orderId: params.order.id,
        orderNumber: params.order.orderNumber,
        deletionType: params.deletionType,
        deletedById: params.adminId,
        deletedByEmail: params.adminEmail,
        reason: params.reason ?? null,
        wasPaid: params.order.paymentStatus === "paid",
        wasTestOrder: params.order.isTestOrder,
        snapshot,
      },
    }),
    // Cascades OrderItem + SupplierOrderEvent
    prisma.order.delete({ where: { id: params.order.id } }),
  ]);

  return { deletedId: params.order.id, orderNumber: params.order.orderNumber };
}

export async function deleteTestOrder(params: {
  orderId: string;
  adminId: string;
  adminEmail: string | null;
  reason?: string | null;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { customer: { select: { email: true, name: true } } },
  });
  if (!order) throw new Error("Ordre ikke funnet");

  return hardDeleteOrder({
    order,
    deletionType: "test",
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    reason: params.reason ?? "Slett testordre",
  });
}

export async function permanentDeleteOrder(params: {
  orderId: string;
  adminId: string;
  adminEmail: string | null;
  confirmation: string;
  reason?: string | null;
}) {
  if (params.confirmation.trim() !== "SLETT") {
    throw new Error('Bekreftelse mangler — skriv «SLETT» for å fortsette');
  }

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { customer: { select: { email: true, name: true } } },
  });
  if (!order) throw new Error("Ordre ikke funnet");

  return hardDeleteOrder({
    order,
    deletionType: "permanent",
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    reason: params.reason ?? "Permanent sletting",
  });
}

/** Bulk hard-delete with production guards. Skips blocked rows instead of failing all. */
export async function bulkDeleteOrders(params: {
  ids: string[];
  adminId: string;
  adminEmail: string | null;
  reason?: string | null;
}) {
  const uniqueIds = Array.from(new Set(params.ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { deleted: 0, blocked: 0, missing: 0, deletedIds: [] as string[], blockedIds: [] as string[] };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: uniqueIds } },
    include: { customer: { select: { email: true, name: true } } },
  });
  const found = new Map(orders.map((o) => [o.id, o]));
  const deletedIds: string[] = [];
  const blockedIds: string[] = [];

  for (const id of uniqueIds) {
    const order = found.get(id);
    if (!order) continue;
    const guard = canBulkDeleteOrder(order);
    if (!guard.ok) {
      blockedIds.push(id);
      continue;
    }
    try {
      await hardDeleteOrder({
        order,
        deletionType: "bulk",
        adminId: params.adminId,
        adminEmail: params.adminEmail,
        reason: params.reason ?? "Bulk-sletting fra ordreliste",
      });
      deletedIds.push(id);
    } catch {
      blockedIds.push(id);
    }
  }

  return {
    deleted: deletedIds.length,
    blocked: blockedIds.length,
    missing: uniqueIds.length - found.size,
    deletedIds,
    blockedIds,
  };
}

export async function findObviousTestOrders(storeId?: string | null) {
  const where: Prisma.OrderWhereInput = {
    AND: [
      // Never touch paid production
      {
        OR: [{ paymentStatus: { not: "paid" } }, { isTestOrder: true }],
      },
      ...(storeId ? [{ storeId }] : []),
    ],
  };

  const candidates = await prisma.order.findMany({
    where,
    include: { customer: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return candidates.filter(isObviousTestOrder);
}

export async function cleanObviousTestOrders(params: {
  storeId?: string | null;
  adminId: string;
  adminEmail: string | null;
}) {
  const matches = await findObviousTestOrders(params.storeId);
  const results: Array<{ id: string; orderNumber: string; ok: boolean; error?: string }> = [];

  for (const order of matches) {
    try {
      await hardDeleteOrder({
        order,
        deletionType: "clean_test",
        adminId: params.adminId,
        adminEmail: params.adminEmail,
        reason: "Rob’s Desk: rydd testordre",
      });
      results.push({ id: order.id, orderNumber: order.orderNumber, ok: true });
    } catch (e: unknown) {
      results.push({
        id: order.id,
        orderNumber: order.orderNumber,
        ok: false,
        error: e instanceof Error ? e.message : "Feil",
      });
    }
  }

  return {
    matched: matches.length,
    deleted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
