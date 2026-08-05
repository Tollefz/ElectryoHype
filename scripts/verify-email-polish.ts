/**
 * Quick polish check: normalize items for latest order (no send).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findFirst({
    include: { orderItems: { include: { product: true } }, customer: true },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    console.log("no orders");
    return;
  }
  const { normalizeOrderLineItems, emailLogoUrl } = await import("../lib/email-items.ts");
  const items = normalizeOrderLineItems({
    itemsJson: order.items,
    orderItems: order.orderItems,
  });
  console.log(
    JSON.stringify(
      {
        order: order.orderNumber,
        logoUrl: emailLogoUrl(),
        items: items.map((i) => ({
          name: i.name,
          qty: i.quantity,
          price: i.price,
          hasImage: Boolean(i.image),
          productUrl: i.productUrl,
        })),
      },
      null,
      2
    )
  );

  // Render confirmation HTML snippet check
  const { render } = await import("@react-email/render");
  const OrderConfirmationEmail = (await import("../emails/order-confirmation.tsx")).default;
  const html = await render(
    OrderConfirmationEmail({
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || "Kunde",
      items,
      subtotal: Number(order.subtotal) || 0,
      shippingCost: Number(order.shippingCost) || 0,
      total: Number(order.total) || 0,
      shippingAddress: { name: "Test", address: "Gate 1", zip: "0001", city: "Oslo" },
      logoUrl: emailLogoUrl(),
    })
  );
  const bad = /Ukjent produkt|Unknown product/i.test(html);
  console.log("htmlLength", html.length, "containsUnknown", bad);
  console.log("hasLogoImg", html.includes("email-logo.png"));
  console.log("hasProductLink", /\/products\//.test(html));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
