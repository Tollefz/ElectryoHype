import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  SupplierOrderStatus,
  FulfillmentStatus,
} from "@prisma/client";
import { z } from "zod";
import { logSupplierEvent } from "@/lib/dropshipping/supplier-events";
import Stripe from "stripe";
import { restoreStockForOrder } from "@/lib/orders/inventory";

const updateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(), // Deprecated, kept for backward compatibility
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus).optional(), // Single source of truth
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  trackingNumber: z.string().optional().nullable(),
  trackingUrl: z.string().optional().nullable(),
  shippingCarrier: z.string().optional().nullable(),
  supplierOrderStatus: z.nativeEnum(SupplierOrderStatus).optional(),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

// GET: Hent ordre detaljer
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Sjekk autentisering
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await context.params;

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId.trim() },
      include: {
        customer: true,
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Parse items fra JSON hvis det finnes
    let items: unknown[] = [];
    try {
      if (typeof order.items === "string") {
        const parsed: unknown = JSON.parse(order.items);
        items = Array.isArray(parsed) ? parsed : [];
      } else if (order.items && Array.isArray(order.items)) {
        items = order.items;
      }
    } catch {
      // Hvis parsing feiler, bruk orderItems
      items = order.orderItems.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        price: item.price,
        quantity: item.quantity,
      }));
    }

    // Parse shipping address
    let shippingAddress: Record<string, unknown> = {};
    try {
      if (typeof order.shippingAddress === "string") {
        const parsed: unknown = JSON.parse(order.shippingAddress);
        shippingAddress =
          typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
      } else if (order.shippingAddress && typeof order.shippingAddress === "object") {
        shippingAddress = order.shippingAddress as Record<string, unknown>;
      }
    } catch {
      shippingAddress = {};
    }

    const noteSetting = await prisma.setting.findUnique({
      where: { key: `order_internal_notes:${orderId.trim()}` },
    });
    const resolvedNotes =
      typeof noteSetting?.value === "string"
        ? noteSetting.value
        : noteSetting?.value != null
          ? String(noteSetting.value)
          : order.internalNotes || null;

    return NextResponse.json({
      ...order,
      items,
      shippingAddress,
      internalNotes: resolvedNotes,
      notes: resolvedNotes,
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

// PATCH: Oppdater ordre
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Sjekk autentisering
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await context.params;

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    // Hent eksisterende ordre
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId.trim() },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const wasShippedBefore = existingOrder.fulfillmentStatus === "SHIPPED";
    const oldFulfillmentStatus = existingOrder.fulfillmentStatus;
    const oldSupplierStatus = existingOrder.supplierOrderStatus;
    const oldPaymentStatus = existingOrder.paymentStatus;

    // Real Stripe refund when marking as refunded
    if (
      validatedData.paymentStatus === "refunded" &&
      oldPaymentStatus !== "refunded" &&
      existingOrder.paymentIntentId
    ) {
      let stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
      stripeSecretKey = stripeSecretKey.replace(/^["']+|["']+$/g, "").trim();
      if (!stripeSecretKey) {
        return NextResponse.json(
          { error: "Kan ikke refundere: Stripe er ikke konfigurert" },
          { status: 500 }
        );
      }
      const stripe = new Stripe(stripeSecretKey, {
        apiVersion: "2025-02-24.acacia",
      });
      try {
        await stripe.refunds.create({
          payment_intent: existingOrder.paymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
          },
        });
        const { trackServerRefund } = await import("@/lib/analytics/meta-capi");
        trackServerRefund({
          transactionId: existingOrder.orderNumber,
          value: Number(existingOrder.total) || 0,
          email: existingOrder.customerEmail,
        }).catch(() => {});
      } catch (refundErr: unknown) {
        console.error("Stripe refund failed:", refundErr);
        const message = refundErr instanceof Error ? refundErr.message : String(refundErr);
        return NextResponse.json(
          {
            error: `Stripe-refusjon feilet: ${message || "ukjent feil"}`,
          },
          { status: 502 }
        );
      }
    }

    // Map fulfillmentStatus to legacy status for backward compatibility
    const { notes, internalNotes, ...rest } = validatedData;
    const updateData: Prisma.OrderUpdateInput = { ...rest };
    if (validatedData.fulfillmentStatus) {
      // Map fulfillmentStatus to legacy status
      const statusMap: Record<FulfillmentStatus, OrderStatus> = {
        NEW: "pending",
        ORDERED_FROM_SUPPLIER: "processing",
        SHIPPED: "shipped",
        DELIVERED: "delivered",
        CANCELLED: "cancelled",
      };
      updateData.status = statusMap[validatedData.fulfillmentStatus];
    }
    const noteValue = internalNotes !== undefined ? internalNotes : notes;
    // Persist notes (Setting key until Prisma client regen picks up Order.internalNotes)
    if (noteValue !== undefined) {
      const settingValue: Prisma.InputJsonValue | typeof Prisma.JsonNull =
        noteValue === null ? Prisma.JsonNull : noteValue;
      await prisma.setting.upsert({
        where: { key: `order_internal_notes:${orderId.trim()}` },
        create: {
          key: `order_internal_notes:${orderId.trim()}`,
          value: settingValue,
        },
        update: { value: settingValue },
      });
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Order" SET "internalNotes" = $1 WHERE id = $2`,
          noteValue,
          orderId.trim()
        );
      } catch {
        /* column may lag in some envs — Setting is source of truth for UI */
      }
    }

    // Oppdater ordre
    const updatedOrder = await prisma.order.update({
      where: { id: orderId.trim() },
      data: updateData,
      include: {
        customer: true,
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    const noteSetting = await prisma.setting.findUnique({
      where: { key: `order_internal_notes:${orderId.trim()}` },
    });
    const resolvedNotes =
      typeof noteSetting?.value === "string"
        ? noteSetting.value
        : noteSetting?.value != null
          ? String(noteSetting.value)
          : null;

    // Restore inventory when refunding a previously paid order
    if (
      validatedData.paymentStatus === "refunded" &&
      oldPaymentStatus === "paid"
    ) {
      await restoreStockForOrder(updatedOrder.id).catch((err) =>
        console.error("Stock restore after refund failed:", err)
      );
    }

    // Hvis fulfillmentStatus endres til SHIPPED -> send shipping email
    const isNowShipped = updatedOrder.fulfillmentStatus === "SHIPPED";

    if (isNowShipped && !wasShippedBefore) {
      const trackingNumber =
        validatedData.trackingNumber ?? updatedOrder.trackingNumber ?? "";
      const trackingUrl =
        validatedData.trackingUrl ??
        updatedOrder.trackingUrl ??
        (trackingNumber ? `https://www.17track.net/en#nums=${trackingNumber}` : "");

      // Fire and forget
      import("@/lib/email").then(({ sendShippingNotification }) => {
        sendShippingNotification(
          updatedOrder.id,
          trackingNumber || "Sporingsnummer ikke tilgjengelig",
          trackingUrl || ""
        ).catch((err) => console.error("Failed to send shipped email:", err));
      });
    }

    // Log supplier status change if changed (internal note only)
    if (
      validatedData.supplierOrderStatus &&
      validatedData.supplierOrderStatus !== oldSupplierStatus
    ) {
      await logSupplierEvent({
        orderId: updatedOrder.id,
        oldStatus: oldSupplierStatus || SupplierOrderStatus.PENDING,
        newStatus: validatedData.supplierOrderStatus,
      });
    }

    // Log fulfillment status change if changed
    if (
      validatedData.fulfillmentStatus &&
      validatedData.fulfillmentStatus !== oldFulfillmentStatus
    ) {
      console.log(`Order ${updatedOrder.orderNumber} fulfillment status changed: ${oldFulfillmentStatus} → ${validatedData.fulfillmentStatus}`);
    }

    // Parse items for response
    let items: unknown[] = [];
    try {
      if (typeof updatedOrder.items === "string") {
        const parsed: unknown = JSON.parse(updatedOrder.items);
        items = Array.isArray(parsed) ? parsed : [];
      } else if (updatedOrder.items && Array.isArray(updatedOrder.items)) {
        items = updatedOrder.items;
      }
    } catch {
      items = updatedOrder.orderItems.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        price: item.price,
        quantity: item.quantity,
      }));
    }

    // Parse shipping address
    let shippingAddress = {};
    try {
      if (typeof updatedOrder.shippingAddress === "string") {
        shippingAddress = JSON.parse(updatedOrder.shippingAddress);
      } else if (updatedOrder.shippingAddress) {
        shippingAddress = updatedOrder.shippingAddress;
      }
    } catch {
      shippingAddress = {};
    }

    return NextResponse.json({
      ...updatedOrder,
      items,
      shippingAddress,
      internalNotes: resolvedNotes,
      notes: resolvedNotes,
      message: "Order updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}

