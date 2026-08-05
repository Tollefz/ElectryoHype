import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/api-auth";

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { code, percentOff, amountOff, usageLimit, expiresAt, storeId } = body;
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const discount = await prisma.discountCode.create({
      data: {
        code: String(code).trim().toUpperCase(),
        percentOff: percentOff ?? null,
        amountOff: amountOff ?? null,
        usageLimit: usageLimit ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        storeId: storeId ?? null,
      },
    });

    return NextResponse.json(discount);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || "failed" }, { status: 500 });
  }
}
