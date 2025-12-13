import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendOrderConfirmation } from "@/lib/email";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await context.params;

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    // Send email (function handles status tracking)
    const result = await sendOrderConfirmation(orderId.trim());

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || "Failed to send email",
          message: `Kunne ikke sende e-post: ${result.error}` 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ordrebekreftelse sendt til kunde",
    });
  } catch (error: any) {
    console.error("Error retrying email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retry email" },
      { status: 500 }
    );
  }
}

