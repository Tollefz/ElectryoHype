import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentIntentId = searchParams.get("paymentIntentId");
    const storeId = await getStoreIdFromHeadersServer();

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "paymentIntentId is required" },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        paymentIntentId: paymentIntentId,
        storeId,
      },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
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

    interface ShippingAddressParsed {
      name?: string | null;
      city?: string | null;
      postalCode?: string | null;
      country?: string | null;
      [key: string]: unknown;
    }

    let shippingAddress: ShippingAddressParsed = {};
    try {
      if (typeof order.shippingAddress === "string") {
        const parsed: unknown = JSON.parse(order.shippingAddress);
        shippingAddress =
          typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as ShippingAddressParsed)
            : {};
      } else if (order.shippingAddress && typeof order.shippingAddress === "object") {
        shippingAddress = order.shippingAddress as ShippingAddressParsed;
      }
    } catch {
      shippingAddress = {};
    }

    return NextResponse.json({
      id: order.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      customer: order.customer,
      items: order.items,
      total: order.total,
      shippingAddress: {
        city: shippingAddress.city ?? null,
        postalCode: shippingAddress.postalCode ?? null,
        country: shippingAddress.country ?? "NO",
        name: shippingAddress.name ?? order.customer?.name ?? null,
      },
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error("Error fetching order by payment intent:", error);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

