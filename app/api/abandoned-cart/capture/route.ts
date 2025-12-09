import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { CartStatus } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, items, storeId } = body;

    if (!items) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }

    const token = nanoid(16);

    const cart = await prisma.abandonedCart.create({
      data: {
        email: email || null,
        items,
        storeId: storeId || null,
        token,
        status: CartStatus.ACTIVE,
      },
    });

    return NextResponse.json({ id: cart.id, token: cart.token });
  } catch (error: any) {
    console.error("abandoned-cart capture error", error);
    return NextResponse.json({ error: error.message || "capture failed" }, { status: 500 });
  }
}

