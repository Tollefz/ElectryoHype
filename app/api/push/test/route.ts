import { sendPush } from "@/lib/push/sendPush";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, body, url } = await req.json();
    const res = await sendPush({ title: title || "Hei!", body: body || "Dette er en test.", url });
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

