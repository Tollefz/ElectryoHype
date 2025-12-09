import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreIdFromHeaders } from "@/lib/store";
import { headers } from "next/headers";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  try {
    const headersList = await headers();
    const storeId = getStoreIdFromHeaders(headersList);
    const order = await prisma.order.findUnique({
      where: { id, storeId },
      include: {
        customer: {
          select: { name: true, email: true },
        },
        orderItems: {
          include: {
            product: true,
          },
        },
        supplierEvents: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Error fetching order by id:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

