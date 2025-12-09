import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, ip, userAgent } = body;
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const affiliate = await prisma.affiliate.findUnique({ where: { code } });
    if (!affiliate) return NextResponse.json({ error: "affiliate not found" }, { status: 404 });

    const click = await prisma.affiliateClick.create({
      data: {
        affiliateId: affiliate.id,
        ip: ip || null,
        userAgent: userAgent || null,
      },
    });

    return NextResponse.json({ success: true, clickId: click.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

