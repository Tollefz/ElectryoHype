import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/utils/logger";

/**
 * Get order by Stripe Checkout Session ID.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    logInfo(`Fetching order by session ID: ${sessionId}`, "[api/orders/by-session]");

    const order = await prisma.order.findFirst({
      where: { stripeSessionId: sessionId },
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
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Parse items
    let items: unknown[] = [];
    try {
      if (typeof order.items === "string") {
        const parsed: unknown = JSON.parse(order.items);
        items = Array.isArray(parsed) ? parsed : [];
      } else if (Array.isArray(order.items)) {
        items = order.items;
      }
    } catch {
      items = order.orderItems.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        price: item.price,
        quantity: item.quantity,
        variantId: item.variantId,
        variantName: item.variantName,
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

    // Session ID is the access proof — return confirmation-safe fields only
    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      status: order.status,
      total: order.total,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      tax: order.tax,
      createdAt: order.createdAt,
      items,
      shippingAddress: {
        city: shippingAddress.city ?? null,
        postalCode: shippingAddress.postalCode ?? null,
        country: shippingAddress.country ?? "NO",
        name: shippingAddress.name ?? order.customer?.name ?? null,
      },
      customer: order.customer
        ? { name: order.customer.name, email: order.customer.email }
        : order.customerEmail
          ? { name: null, email: order.customerEmail }
          : null,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
    });
  } catch (error) {
    logError(error, "[api/orders/by-session]");
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

