import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { endpoint, keys, customerId, storeId } = body;
    if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        keys: keys ?? null,
        customerId: customerId ?? null,
        storeId: storeId ?? null,
      },
      create: {
        endpoint,
        keys: keys ?? null,
        customerId: customerId ?? null,
        storeId: storeId ?? null,
      },
    });

    return NextResponse.json({ success: true, id: sub.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

