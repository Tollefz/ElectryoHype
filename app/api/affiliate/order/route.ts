import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, orderId, commissionAmount } = body;
    if (!code || !orderId) return NextResponse.json({ error: "code and orderId required" }, { status: 400 });

    const affiliate = await prisma.affiliate.findUnique({ where: { code } });
    if (!affiliate) return NextResponse.json({ error: "affiliate not found" }, { status: 404 });

    await prisma.affiliateOrder.create({
      data: {
        affiliateId: affiliate.id,
        orderId,
        commissionAmount: commissionAmount ?? 0,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

