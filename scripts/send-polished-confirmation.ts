import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const { sendOrderConfirmation } = await import("../lib/email.ts");
  const order = await prisma.order.findFirst({ orderBy: { createdAt: "desc" } });
  if (!order) throw new Error("no order");
  const result = await sendOrderConfirmation(order.id);
  console.log("sendResult", result);
  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      orderNumber: true,
      customerEmailStatus: true,
      customerEmailLastError: true,
      customerEmailSentAt: true,
    },
  });
  console.log("db", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
