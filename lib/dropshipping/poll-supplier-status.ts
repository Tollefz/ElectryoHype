import { prisma } from "@/lib/prisma";
import { SupplierOrderStatus } from "@prisma/client";
import { getSupplierAdapter } from "@/lib/suppliers";
import { logSupplierEvent } from "./supplier-events";

/**
 * Poll supplier for orders that are not yet delivered.
 * Currently a stub/mock that calls adapter.getOrderStatus and updates local status.
 */
export async function pollSupplierStatus(storeId?: string) {
  const candidates = await prisma.order.findMany({
    where: {
      supplierOrderId: { not: null },
      supplierOrderStatus: {
        in: [
          SupplierOrderStatus.SENT_TO_SUPPLIER,
          SupplierOrderStatus.ACCEPTED_BY_SUPPLIER,
          SupplierOrderStatus.SHIPPED,
        ],
      },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      id: true,
      supplierOrderId: true,
      supplierOrderStatus: true,
    },
  });

  if (candidates.length === 0) {
    return { processed: 0, updated: 0 };
  }

  const adapter = await getSupplierAdapter();
  let updated = 0;

  for (const order of candidates) {
    try {
      const status = await adapter.getOrderStatus(order.supplierOrderId!);
      const newStatus = status.status.toUpperCase() as SupplierOrderStatus;

      if (newStatus !== order.supplierOrderStatus) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierOrderStatus: newStatus,
            trackingNumber: status.trackingNumber ?? null,
            trackingUrl: status.trackingUrl ?? null,
          },
        });
        await logSupplierEvent({
          orderId: order.id,
          oldStatus: order.supplierOrderStatus,
          newStatus,
          metadata: { supplierOrderId: order.supplierOrderId },
        });
        updated++;
      }
    } catch (error) {
      console.error("[pollSupplierStatus] failed for order", order.id, error);
    }
  }

  return { processed: candidates.length, updated };
}

