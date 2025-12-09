import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type EventType =
  | "ORDER_CREATED"
  | "PAYMENT_CONFIRMED"
  | "SENT_TO_SUPPLIER"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "ERROR"
  | "SUPPLIER_EVENT";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        supplierEvents: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const events: Array<{
      type: EventType;
      timestamp: Date;
      label: string;
      description?: string;
    }> = [];

    // Order created
    events.push({
      type: "ORDER_CREATED",
      timestamp: order.createdAt,
      label: "Ordre opprettet",
    });

    // Payment confirmed
    if (order.paymentStatus === "paid") {
      events.push({
        type: "PAYMENT_CONFIRMED",
        timestamp: order.updatedAt || order.createdAt,
        label: "Betaling bekreftet",
      });
    }

    // Supplier events
    for (const ev of order.supplierEvents) {
      events.push({
        type: "SUPPLIER_EVENT",
        timestamp: ev.createdAt,
        label: ev.newStatus,
        description: ev.oldStatus ? `Fra ${ev.oldStatus}` : undefined,
      });
      if (ev.newStatus === "SHIPPED") {
        events.push({
          type: "SHIPPED",
          timestamp: ev.createdAt,
          label: "Sendt fra leverandør",
        });
      }
      if (ev.newStatus === "DELIVERED") {
        events.push({
          type: "DELIVERED",
          timestamp: ev.createdAt,
          label: "Levert",
        });
      }
      if (ev.newStatus === "CANCELLED") {
        events.push({
          type: "CANCELLED",
          timestamp: ev.createdAt,
          label: "Kansellert hos leverandør",
        });
      }
    }

    // Tracking hints
    if (order.trackingNumber) {
      events.push({
        type: "SHIPPED",
        timestamp: order.updatedAt || order.createdAt,
        label: "Sendt (sporingsnummer lagt til)",
        description: order.trackingNumber,
      });
    }

    // If order status delivered
    if (order.status === "delivered") {
      events.push({
        type: "DELIVERED",
        timestamp: order.updatedAt || new Date(),
        label: "Levert",
      });
    }

    // Sort chronologically
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching tracking events:", error);
    return NextResponse.json({ error: "Failed to fetch tracking events" }, { status: 500 });
  }
}

