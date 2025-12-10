import { NextResponse } from "next/server";
import { pollSupplierStatus } from "@/lib/dropshipping/poll-supplier-status";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-token");
  if (!secret || secret !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const overrideStore = searchParams.get("storeId");
    const storeId = overrideStore || await getStoreIdFromHeadersServer();
    const result = await pollSupplierStatus(storeId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[poll-supplier-status] error", error);
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

