import { prisma } from "@/lib/prisma";

type Line = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

/**
 * Decrement product/variant stock for a paid order.
 * Idempotent when called only on unpaid → paid transitions (caller must gate).
 */
export async function decrementStockForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });
  if (!order) return;

  const lines: Line[] = [];

  if (order.orderItems.length > 0) {
    for (const item of order.orderItems) {
      lines.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }
  } else {
    try {
      const parsed = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item?.productId) continue;
          lines.push({
            productId: String(item.productId),
            variantId: item.variantId ? String(item.variantId) : null,
            quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          });
        }
      }
    } catch {
      console.warn("⚠️ Could not parse order items for stock decrement:", orderId);
      return;
    }
  }

  for (const line of lines) {
    const qty = Math.max(0, Math.floor(line.quantity));
    if (!qty || !line.productId) continue;

    if (line.variantId) {
      await prisma.productVariant.updateMany({
        where: { id: line.variantId, productId: line.productId },
        data: { stock: { decrement: qty } },
      });
    }

    await prisma.product.updateMany({
      where: { id: line.productId },
      data: { stock: { decrement: qty } },
    });
  }

  console.log(`📦 Stock decremented for order ${orderId} (${lines.length} lines)`);
}

/**
 * Restore stock when an order is refunded/cancelled after stock was taken.
 */
export async function restoreStockForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });
  if (!order) return;

  const lines: Line[] = [];
  if (order.orderItems.length > 0) {
    for (const item of order.orderItems) {
      lines.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }
  } else {
    try {
      const parsed = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item?.productId) continue;
          lines.push({
            productId: String(item.productId),
            variantId: item.variantId ? String(item.variantId) : null,
            quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          });
        }
      }
    } catch {
      return;
    }
  }

  for (const line of lines) {
    const qty = Math.max(0, Math.floor(line.quantity));
    if (!qty || !line.productId) continue;

    if (line.variantId) {
      await prisma.productVariant.updateMany({
        where: { id: line.variantId, productId: line.productId },
        data: { stock: { increment: qty } },
      });
    }

    await prisma.product.updateMany({
      where: { id: line.productId },
      data: { stock: { increment: qty } },
    });
  }

  console.log(`📦 Stock restored for order ${orderId} (${lines.length} lines)`);
}
