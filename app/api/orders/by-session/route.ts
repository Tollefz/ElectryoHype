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
    let items: any[] = [];
    try {
      if (typeof order.items === "string") {
        items = JSON.parse(order.items);
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
    let shippingAddress: any = {};
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
    logError(error, "[api/orders/by-session]");
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

