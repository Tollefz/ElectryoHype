/**
 * Order Automation — tracking layer.
 * Polls supplier for tracking; updates order; never spam (caller owns cadence).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getSupplierAdapter } from "@/lib/suppliers";
import type { Supplier } from "@/lib/suppliers/types";
import { SupplierOrderStatus } from "@prisma/client";
import { logSupplierEvent } from "@/lib/dropshipping/supplier-events";

export type TrackingPollResult =
  | {
      ok: true;
      changed: boolean;
      trackingNumber: string | null;
      trackingUrl: string | null;
      carrier: string | null;
      supplierStatus: string;
    }
  | { ok: false; error: string; retryable: boolean };

/**
 * Fetch tracking for an order that already has supplierOrderId.
 * Stub CJ adapters return pending — engine stays on ORDERED until real data.
 */
export async function pollOrderTracking(
  orderId: string
): Promise<TrackingPollResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: { include: { product: true } },
    },
  });

  if (!order?.supplierOrderId) {
    return {
      ok: false,
      error: "Mangler supplierOrderId",
      retryable: false,
    };
  }

  const supplierName =
    order.orderItems
      .map((i) => i.product?.supplierName?.toLowerCase())
      .find(Boolean) || "cj";

  try {
    const adapter = await getSupplierAdapter(supplierName as Supplier);
    const status = await adapter.getOrderStatus(order.supplierOrderId);

    const trackingNumber =
      (status as { trackingNumber?: string }).trackingNumber ||
      order.trackingNumber ||
      null;
    const trackingUrl =
      (status as { trackingUrl?: string }).trackingUrl ||
      order.trackingUrl ||
      null;
    const carrier =
      (status as { carrier?: string }).carrier ||
      order.shippingCarrier ||
      null;

    const changed =
      trackingNumber !== order.trackingNumber ||
      trackingUrl !== order.trackingUrl ||
      carrier !== order.shippingCarrier;

    if (changed && trackingNumber) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          trackingNumber,
          trackingUrl,
          shippingCarrier: carrier,
          supplierOrderStatus: SupplierOrderStatus.SHIPPED,
        },
      });
      await logSupplierEvent({
        orderId: order.id,
        oldStatus: order.supplierOrderStatus,
        newStatus: SupplierOrderStatus.SHIPPED,
        metadata: {
          trackingNumber,
          trackingUrl,
          carrier,
          via: "order-engine",
        },
      });
    }

    return {
      ok: true,
      changed: Boolean(changed && trackingNumber),
      trackingNumber,
      trackingUrl,
      carrier,
      supplierStatus: status.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, retryable: true };
  }
}
