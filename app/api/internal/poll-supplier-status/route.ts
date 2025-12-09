import { NextResponse } from "next/server";
import { pollSupplierStatus } from "@/lib/dropshipping/poll-supplier-status";
import { getStoreIdFromHeaders } from "@/lib/store";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-token");
  if (!secret || secret !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const overrideStore = searchParams.get("storeId");
    const headersList = await headers();
    const storeId = overrideStore || getStoreIdFromHeaders(headersList);
    const result = await pollSupplierStatus(storeId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[poll-supplier-status] error", error);
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

