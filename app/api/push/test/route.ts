import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { sendPush } from "@/lib/push/sendPush";

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { title, body, url } = await req.json();
    const res = await sendPush({
      title: title || "Hei!",
      body: body || "Dette er en test.",
      url,
    });
    return NextResponse.json(res);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || "failed" }, { status: 500 });
  }
}
