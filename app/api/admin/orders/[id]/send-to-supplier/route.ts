import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { sendOrderToSupplier } from "@/lib/dropshipping/send-order-to-supplier";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  try {
    await sendOrderToSupplier(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Kunne ikke sende ordre til leverandør" },
      { status: 500 }
    );
  }
}

