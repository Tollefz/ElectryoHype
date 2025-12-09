import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupplierAdapter } from "@/lib/suppliers";
import type { Supplier } from "@/lib/suppliers/types";

export async function updateOrderTracking(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!order || !order.supplierOrderId) {
    return null;
  }

  const supplierName = order.orderItems[0]?.product?.supplierName;
  if (!supplierName) {
    return null;
  }

  const adapter = await getSupplierAdapter(supplierName.toLowerCase() as Supplier);
  const tracking = await (adapter as any).getTracking(order.supplierOrderId);

  const nextStatus =
    tracking.status === "delivered"
      ? OrderStatus.delivered
      : tracking.status === "shipped"
        ? OrderStatus.shipped
        : order.status === OrderStatus.processing
          ? OrderStatus.shipped
          : order.status;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      trackingNumber: tracking.trackingNumber || order.trackingNumber,
      trackingUrl: tracking.trackingUrl || order.trackingUrl,
      updatedAt: new Date(),
    },
  });

  // AutomationLog model ikke tilgjengelig i schema
  // await prisma.automationLog.create({
  //   data: {
  //     type: "tracking",
  //     orderId: order.id,
  //     action: "success",
  //     details: JSON.stringify({
  //       status: tracking.status,
  //       trackingNumber: tracking.trackingNumber,
  //     }),
  //   },
  // });

  return updated;
}

