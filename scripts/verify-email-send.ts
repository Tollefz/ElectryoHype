import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const key = (process.env.RESEND_API_KEY || "").trim();
  console.log("apiKeyDetected:", key ? "yes" : "no");
  console.log("EMAIL_FROM:", process.env.EMAIL_FROM || "(default)");
  console.log("ADMIN_EMAIL:", process.env.ADMIN_EMAIL ? "set" : "missing");

  const order = await prisma.order.findFirst({
    where: { customer: { isNot: null } },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    console.log("No orders found — cannot exercise sendOrderConfirmation");
    return;
  }
  console.log("testOrder:", order.id, order.orderNumber, "to:", order.customer?.email);

  const { sendOrderConfirmation, getEmailEnvStatus } = await import("../lib/email.ts");
  console.log("getEmailEnvStatus:", getEmailEnvStatus());
  const result = await sendOrderConfirmation(order.id);
  console.log("sendResult:", result);

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      customerEmailStatus: true,
      customerEmailLastError: true,
      customerEmailSentAt: true,
    },
  });
  console.log("dbAfter:", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
