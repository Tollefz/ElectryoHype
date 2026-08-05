/**
 * Order Automation — CJ fulfillment adapter layer.
 * Architecture: Order Engine owns orchestration; this module only talks to CJ.
 *
 * Real CJ order/logistics HTTP can replace the stub adapter without changing
 * the state machine. Today wraps existing SupplierAdapter.createOrder.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getSupplierAdapter } from "@/lib/suppliers";
import type { NormalizedOrder, Supplier } from "@/lib/suppliers/types";
import { logSupplierEvent } from "@/lib/dropshipping/supplier-events";
import { SupplierOrderStatus } from "@prisma/client";

export type CjFulfillmentResult =
  | {
      ok: true;
      supplierOrderId: string;
      supplier: string;
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
    };

type ShippingAddressFields = {
  name?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  address2?: string;
  city?: string;
  zip?: string;
  zipCode?: string;
  country?: string;
  region?: string;
  state?: string;
};

/**
 * Create supplier order (CJ when configured). Idempotent if supplierOrderId exists.
 */
export async function createCjFulfillmentOrder(
  orderId: string
): Promise<CjFulfillmentResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      orderItems: {
        include: { product: true, variant: true },
      },
    },
  });

  if (!order) {
    return { ok: false, error: "Order not found", retryable: false };
  }

  if (order.supplierOrderId) {
    return {
      ok: true,
      supplierOrderId: order.supplierOrderId,
      supplier: "existing",
    };
  }

  let shippingAddress: ShippingAddressFields = {};
  try {
    shippingAddress =
      typeof order.shippingAddress === "string"
        ? (JSON.parse(order.shippingAddress) as ShippingAddressFields)
        : ((order.shippingAddress as ShippingAddressFields | null) || {});
  } catch {
    shippingAddress = {};
  }

  const items = order.orderItems.map((item) => {
    const supplierSku =
      item.product?.supplierSku ||
      item.variant?.sku ||
      item.product?.supplierProductId ||
      item.productId;
    return {
      name: item.product?.name || item.variantName || "Produkt",
      quantity: item.quantity,
      supplierSku: supplierSku || item.productId,
    };
  });

  const payload: NormalizedOrder = {
    orderId: order.id,
    storeId: order.storeId,
    customer: {
      name: shippingAddress.name || order.customer?.name || "Kunde",
      email: order.customerEmail || order.customer?.email || undefined,
      phone: order.customer?.phone || undefined,
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

  // Prefer CJ if any line is CJ; else first product supplier; else configured default
  const supplierName =
    order.orderItems
      .map((i) => i.product?.supplierName?.toLowerCase())
      .find((s) => s === "cj" || s === "cjdropshipping") ||
    order.orderItems[0]?.product?.supplierName?.toLowerCase() ||
    "cj";

  try {
    const adapter = await getSupplierAdapter(supplierName as Supplier);
    const result = await adapter.createOrder(payload);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        supplierOrderId: result.supplierOrderId,
        supplierOrderStatus: SupplierOrderStatus.SENT_TO_SUPPLIER,
        autoOrderError: null,
      },
    });

    await logSupplierEvent({
      orderId: order.id,
      oldStatus: SupplierOrderStatus.PENDING,
      newStatus: SupplierOrderStatus.SENT_TO_SUPPLIER,
      metadata: {
        supplierOrderId: result.supplierOrderId,
        supplier: supplierName,
        via: "order-engine",
      },
    });

    return {
      ok: true,
      supplierOrderId: result.supplierOrderId,
      supplier: supplierName,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.order.update({
      where: { id: order.id },
      data: { autoOrderError: message.slice(0, 500) },
    });
    return { ok: false, error: message, retryable: true };
  }
}
