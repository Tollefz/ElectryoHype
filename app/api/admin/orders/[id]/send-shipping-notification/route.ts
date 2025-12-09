import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendShippingNotification } from "@/lib/email";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Sjekk autentisering
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await context.params;

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const body = await req.json();
    const { trackingNumber, trackingUrl } = body;

    if (!trackingNumber) {
      return NextResponse.json(
        { error: "Tracking number is required" },
        { status: 400 }
      );
    }

    await sendShippingNotification(
      orderId.trim(),
      trackingNumber,
      trackingUrl || `https://tracking.example.com/${trackingNumber}`
    );

    return NextResponse.json({
      success: true,
      message: "Forsendelse-notifikasjon sendt til kunde",
    });
  } catch (error: any) {
    console.error("Error sending shipping notification:", error);
    return NextResponse.json(
      { error: error.message || "Kunne ikke sende forsendelse-notifikasjon" },
      { status: 500 }
    );
  }
}

