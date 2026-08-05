import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEmailEnvStatus, sendOrderConfirmation } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await context.params;

    if (!orderId || orderId.trim() === "") {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const env = getEmailEnvStatus();
    console.log("[retry-email] env", {
      orderId: orderId.trim(),
      apiKeyDetected: env.apiKeyDetected ? "yes" : "no",
      emailFrom: env.emailFrom,
      adminEmailSet: env.adminEmailSet,
    });

    const result = await sendOrderConfirmation(orderId.trim());

    const order = await prisma.order.findUnique({
      where: { id: orderId.trim() },
      select: {
        customerEmailStatus: true,
        customerEmailLastError: true,
        customer: { select: { email: true } },
      },
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || "Failed to send email",
          message: `Kunne ikke sende e-post: ${result.error}`,
          diagnostics: {
            apiKeyDetected: env.apiKeyDetected,
            emailFrom: env.emailFrom,
            recipient: order?.customer?.email ?? null,
            finalDatabaseStatus: order?.customerEmailStatus ?? null,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ordrebekreftelse sendt til kunde",
      diagnostics: {
        apiKeyDetected: env.apiKeyDetected,
        emailFrom: env.emailFrom,
        recipient: order?.customer?.email ?? null,
        finalDatabaseStatus: order?.customerEmailStatus ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("Error retrying email:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message || "Failed to retry email" },
      { status: 500 }
    );
  }
}
