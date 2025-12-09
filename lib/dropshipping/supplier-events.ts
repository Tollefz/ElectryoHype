import { prisma } from "@/lib/prisma";
import { SupplierOrderStatus } from "@prisma/client";

/**
 * Log a supplier order event for auditing and timeline.
 */
export async function logSupplierEvent(params: {
  orderId: string;
  oldStatus?: SupplierOrderStatus | null;
  newStatus: SupplierOrderStatus;
  metadata?: Record<string, any>;
}) {
  const { orderId, oldStatus, newStatus, metadata } = params;

  try {
    await prisma.supplierOrderEvent.create({
      data: {
        orderId,
        oldStatus,
        newStatus,
        metadata: metadata as any,
      },
    });
  } catch (error) {
    console.error("[SupplierEvent] Failed to log event", { orderId, newStatus, error });
  }
}

