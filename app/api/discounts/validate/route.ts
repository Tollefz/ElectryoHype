import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const now = new Date();
    const dc = await prisma.discountCode.findUnique({ where: { code } });
    if (!dc || dc.isActive === false) {
      return NextResponse.json({ valid: false, reason: "not_found" });
    }
    if (dc.expiresAt && dc.expiresAt < now) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }
    if (dc.usageLimit && dc.timesUsed >= dc.usageLimit) {
      return NextResponse.json({ valid: false, reason: "limit_reached" });
    }

    return NextResponse.json({
      valid: true,
      code: dc.code,
      percentOff: dc.percentOff,
      amountOff: dc.amountOff,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

