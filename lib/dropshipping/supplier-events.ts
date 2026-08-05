import { prisma } from "@/lib/prisma";
import { Prisma, SupplierOrderStatus } from "@prisma/client";

/**
 * Log a supplier order event for auditing and timeline.
 */
export async function logSupplierEvent(params: {
  orderId: string;
  oldStatus?: SupplierOrderStatus | null;
  newStatus: SupplierOrderStatus;
  metadata?: Prisma.InputJsonValue;
}) {
  const { orderId, oldStatus, newStatus, metadata } = params;

  try {
    await prisma.supplierOrderEvent.create({
      data: {
        orderId,
        oldStatus,
        newStatus,
        metadata,
      },
    });
  } catch (error) {
    console.error("[SupplierEvent] Failed to log event", { orderId, newStatus, error });
  }
}

