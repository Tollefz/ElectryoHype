import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Lazy import to avoid build-time errors
    const { syncProductPrices, syncProductAvailability } = await import("@/lib/automation/product-importer");

    await syncProductPrices();
    await syncProductAvailability();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error syncing products:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync products" },
      { status: 500 }
    );
  }
}

