import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, percentOff, amountOff, usageLimit, expiresAt, storeId } = body;
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const discount = await prisma.discountCode.create({
      data: {
        code,
        percentOff: percentOff ?? null,
        amountOff: amountOff ?? null,
        usageLimit: usageLimit ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        storeId: storeId ?? null,
      },
    });

    return NextResponse.json(discount);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

