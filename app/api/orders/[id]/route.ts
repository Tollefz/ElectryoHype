import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  try {
    const storeId = await getStoreIdFromHeadersServer();
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

