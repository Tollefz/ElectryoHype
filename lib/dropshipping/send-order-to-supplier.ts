import { prisma } from "@/lib/prisma";
import { getDropshippingConfig } from "@/config/dropshipping";
import { SupplierOrderStatus } from "@prisma/client";
import { getSupplierAdapter } from "@/lib/suppliers";
import type { NormalizedOrder } from "@/lib/suppliers/types";
import type { Supplier } from "@/lib/suppliers/types";
import { logSupplierEvent } from "@/lib/dropshipping/supplier-events";

export async function sendOrderToSupplier(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      orderItems: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  });

  if (!order) {
    console.warn("[Dropshipping] Order ikke funnet:", orderId);
    return;
  }

  // Bygg items med supplierSku fallbacks
  const items = order.orderItems.map((item) => {
    const supplierSku =
      item.product?.supplierSku ||
      item.variant?.sku ||
      item.product?.supplierProductId ||
      item.productId;

    return {
      name: item.product?.name || item.variantName || "Produkt",
      quantity: item.quantity,
      supplierSku,
    };
  });

  // Parse shipping address
  let shippingAddress: any = {};
  try {
    shippingAddress =
      typeof order.shippingAddress === "string"
        ? JSON.parse(order.shippingAddress)
        : order.shippingAddress || {};
  } catch {
    shippingAddress = {};
  }

  const payload: NormalizedOrder = {
    orderId: order.id,
    storeId: order.storeId,
    customer: {
      name: shippingAddress.name || order.customer?.name || "Kunde",
      email: order.customer?.email,
      phone: order.customer?.phone,
    },
    shippingAddress: {
      line1: shippingAddress.address || shippingAddress.addressLine1 || "",
      line2: shippingAddress.addressLine2 || shippingAddress.address2 || "",
      city: shippingAddress.city || "",
      postalCode: shippingAddress.zip || shippingAddress.zipCode || "",
      country: shippingAddress.country || "NO",
      region: shippingAddress.region || shippingAddress.state || "",
    },
    items,
  };

  try {
    // Get supplier from first order item, or use config fallback
    const supplierName = order.orderItems[0]?.product?.supplierName;
    const supplier = supplierName
      ? (supplierName.toLowerCase() as Supplier)
      : undefined;
    
    const adapter = await getSupplierAdapter(supplier);
    const result = await adapter.createOrder(payload);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        supplierOrderId: result.supplierOrderId,
        supplierOrderStatus: SupplierOrderStatus.SENT_TO_SUPPLIER,
        autoOrderError: null,
        autoOrderAttempts: { increment: 1 },
      },
    });

    await logSupplierEvent({
      orderId: order.id,
      oldStatus: order.supplierOrderStatus || SupplierOrderStatus.PENDING,
      newStatus: SupplierOrderStatus.SENT_TO_SUPPLIER,
      metadata: { supplierOrderId: result.supplierOrderId },
    });

    console.log("[Dropshipping] Ordre sendt til leverandør", {
      orderId,
      supplierOrderId: result.supplierOrderId,
    });
  } catch (error: any) {
    console.error("[Dropshipping] Feil ved sending til leverandør", error);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        supplierOrderStatus: SupplierOrderStatus.PENDING,
        autoOrderError: error?.message || "Kunne ikke sende til leverandør",
        autoOrderAttempts: { increment: 1 },
      },
    });

    await logSupplierEvent({
      orderId: order.id,
      oldStatus: order.supplierOrderStatus || SupplierOrderStatus.PENDING,
      newStatus: SupplierOrderStatus.PENDING,
      metadata: { error: error?.message || "send failed" },
    });
  }
}

