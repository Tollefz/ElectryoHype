import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { requireAdminSession, toPublicOrder } from "@/lib/api-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") || searchParams.get("session_id");
    const paymentIntentId =
      searchParams.get("paymentIntentId") || searchParams.get("payment_intent");

    const storeId = await getStoreIdFromHeadersServer();
    const order = await prisma.order.findUnique({
      where: { id, storeId },
      include: {
        customer: { select: { name: true, email: true } },
        orderItems: {
          include: { product: { select: { name: true } } },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const admin = await requireAdminSession();
    const ownsViaSession = !!(sessionId && order.stripeSessionId === sessionId);
    const ownsViaPi = !!(paymentIntentId && order.paymentIntentId === paymentIntentId);

    if (admin.ok) {
      return NextResponse.json(order);
    }

    // Proof of ownership via Stripe session / PI → limited public payload + customer display fields
    if (ownsViaSession || ownsViaPi) {
      const pub = toPublicOrder({
        ...order,
        items: order.orderItems.map((item) => ({
          name: item.product?.name,
          quantity: item.quantity,
          price: item.price,
          variantName: item.variantName,
        })),
      });
      return NextResponse.json({
        ...pub,
        customer: order.customer
          ? { name: order.customer.name, email: order.customer.email }
          : null,
        customerEmail: order.customerEmail,
        orderItems: order.orderItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price,
          variantName: item.variantName,
          product: { name: item.product?.name },
        })),
      });
    }

    // Bare order-id access: status/tracking only — no email, no full address, no customer
    const pub = toPublicOrder({
      ...order,
      items: order.orderItems.map((item) => ({
        name: item.product?.name,
        quantity: item.quantity,
        price: item.price,
        variantName: item.variantName,
      })),
    });

    return NextResponse.json({
      ...pub,
      orderItems: order.orderItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        variantName: item.variantName,
        product: { name: item.product?.name },
      })),
      supplierOrderStatus: order.supplierOrderStatus,
    });
  } catch (error) {
    console.error("Error fetching order by id:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}
