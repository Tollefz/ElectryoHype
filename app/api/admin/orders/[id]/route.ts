import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { OrderStatus, PaymentStatus, SupplierOrderStatus, FulfillmentStatus } from "@prisma/client";
import { z } from "zod";
import { logSupplierEvent } from "@/lib/dropshipping/supplier-events";

const updateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(), // Deprecated, kept for backward compatibility
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus).optional(), // Single source of truth
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().optional(),
  shippingCarrier: z.string().optional(),
  supplierOrderStatus: z.nativeEnum(SupplierOrderStatus).optional(), // Internal note only
  notes: z.string().optional(),
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
    let items: any[] = [];
    try {
      if (typeof order.items === "string") {
        const parsed = JSON.parse(order.items);
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
    let shippingAddress = {};
    try {
      if (typeof order.shippingAddress === "string") {
        shippingAddress = JSON.parse(order.shippingAddress);
      } else if (order.shippingAddress) {
        shippingAddress = order.shippingAddress;
      }
    } catch {
      shippingAddress = {};
    }

    return NextResponse.json({
      ...order,
      items,
      shippingAddress,
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

    // Map fulfillmentStatus to legacy status for backward compatibility
    const updateData: any = { ...validatedData };
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
    let items: any[] = [];
    try {
      if (typeof updatedOrder.items === "string") {
        const parsed = JSON.parse(updatedOrder.items);
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

