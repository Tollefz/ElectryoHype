import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEmailEnvStatus, sendOrderConfirmation } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
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
    const result = await sendOrderConfirmation(orderId.trim());

    const order = await prisma.order.findUnique({
      where: { id: orderId.trim() },
      select: {
        customerEmailStatus: true,
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
      message: "E-post sendt til kunde",
      diagnostics: {
        apiKeyDetected: env.apiKeyDetected,
        emailFrom: env.emailFrom,
        recipient: order?.customer?.email ?? null,
        finalDatabaseStatus: order?.customerEmailStatus ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("Error sending email:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message || "Kunne ikke sende e-post" },
      { status: 500 }
    );
  }
}

