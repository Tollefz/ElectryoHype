import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendOrderConfirmation } from "@/lib/email";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Sjekk autentisering
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Håndter både sync og async params
    const resolvedParams = params instanceof Promise ? await params : params;
    const orderId = resolvedParams.id;

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    await sendOrderConfirmation(orderId.trim());

    return NextResponse.json({
      success: true,
      message: "E-post sendt til kunde",
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: error.message || "Kunne ikke sende e-post" },
      { status: 500 }
    );
  }
}

