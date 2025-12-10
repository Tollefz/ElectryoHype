import { NextResponse } from "next/server";
import { syncRunner } from "@/lib/supplier-sync";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-token");
  if (!secret || secret !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const overrideStore = searchParams.get("storeId");
  const storeId = overrideStore || await getStoreIdFromHeadersServer();

  const dryRun = searchParams.get("dryRun") !== "false";

  try {
    const result = await syncRunner(storeId, dryRun);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[sync-supplier-products] error", error);
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 });
  }
}

