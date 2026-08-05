import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireInternalToken } from "@/lib/api-auth";

export async function POST(req: Request) {
  const internalDenied = requireInternalToken(req);
  const admin = await requireAdminSession();
  if (internalDenied && !admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, orderId, commissionAmount } = body;
    if (!code || !orderId) {
      return NextResponse.json({ error: "code and orderId required" }, { status: 400 });
    }

    // Never trust client-supplied commission in production paths — look up affiliate rate later.
    // For now require auth and clamp amount.
    const amount = Math.max(0, Number(commissionAmount ?? 0));
    if (!Number.isFinite(amount) || amount > 100_000) {
      return NextResponse.json({ error: "Invalid commissionAmount" }, { status: 400 });
    }

    const affiliate = await prisma.affiliate.findUnique({ where: { code } });
    if (!affiliate) return NextResponse.json({ error: "affiliate not found" }, { status: 404 });

    await prisma.affiliateOrder.create({
      data: {
        affiliateId: affiliate.id,
        orderId,
        commissionAmount: amount,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || "failed" }, { status: 500 });
  }
}
