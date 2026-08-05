/**
 * Render customer confirmation HTML preview for client testing.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findFirst({
    include: { orderItems: { include: { product: true } }, customer: true },
    orderBy: { createdAt: "desc" },
  });
  if (!order) throw new Error("no order");

  const { normalizeOrderLineItems } = await import("../lib/email-items.ts");
  const { getEmailLogoAttachment } = await import("../lib/email-logo.server.ts");
  const { resolveEmailLogoSrc, humanizeProductTitle } =
    await import("../lib/email-branding.ts");
  const { render } = await import("@react-email/render");
  const OrderConfirmationEmail = (await import("../emails/order-confirmation.tsx")).default;

  const items = normalizeOrderLineItems({
    itemsJson: order.items,
    orderItems: order.orderItems,
    forCustomerEmail: true,
  });

  const logo = getEmailLogoAttachment();
  const logoUrl = resolveEmailLogoSrc(Boolean(logo));

  console.log(
    "titles",
    items.map((i) => i.name),
    "logoBytes",
    logo?.content.length,
    "logoSrc",
    logoUrl
  );
  console.log(
    "humanize samples",
    [
      "Stk Fra Lightning Hunn Usb C",
      "testprodukt",
      "Lydresonansguide Audio Mini Tws Trådløs Høyttaler Bassforsterkning Overflateadsorpsjon",
    ].map((t) => ({ in: t, out: humanizeProductTitle(t) }))
  );

  const html = await render(
    OrderConfirmationEmail({
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || "Kunde",
      items,
      subtotal: Number(order.subtotal) || 0,
      shippingCost: Number(order.shippingCost) || 0,
      total: Number(order.total) || 0,
      shippingAddress: { name: "Ola Nordmann", address: "Karl Johans gate 1", zip: "0154", city: "Oslo" },
      logoUrl: logo ? `data:image/png;base64,${logo.content.toString("base64")}` : logoUrl,
      siteUrl: "https://www.electrohypex.com",
    })
  );

  const out = path.join(process.cwd(), "tmp-email-preview.html");
  // Wrap with client simulators notes
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preview</title>
  <style>
    body{margin:0;font-family:system-ui;background:#e5e7eb}
    .bar{display:flex;gap:8px;flex-wrap:wrap;padding:12px;background:#111827;color:#fff;position:sticky;top:0;z-index:2}
    .bar button{background:#374151;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer}
    .bar button.active{background:#00C853;color:#042}
    .frame-wrap{margin:16px auto;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12)}
    iframe{width:100%;height:900px;border:0;display:block}
    .w-desktop{max-width:640px}
    .w-mobile{max-width:375px}
    .dark-sim{filter:invert(1) hue-rotate(180deg)}
  </style></head><body>
  <div class="bar">
    <strong>ElectroHypeX email preview</strong>
    <button data-w="desktop" class="active">Gmail/Outlook desktop (~600px)</button>
    <button data-w="mobile">Apple Mail / mobile (375px)</button>
    <button data-dark>Toggle dark simulation</button>
  </div>
  <div class="frame-wrap w-desktop" id="wrap"><iframe id="f" srcdoc="${html
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")}"></iframe></div>
  <script>
    const wrap=document.getElementById('wrap');
    document.querySelectorAll('[data-w]').forEach(btn=>btn.onclick=()=>{
      document.querySelectorAll('[data-w]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      wrap.className='frame-wrap '+(btn.dataset.w==='mobile'?'w-mobile':'w-desktop');
    });
    document.querySelector('[data-dark]').onclick=()=>wrap.classList.toggle('dark-sim');
  </script>
  </body></html>`;

  fs.writeFileSync(out, doc);
  console.log("wrote", out);
  console.log("checks", {
    hasCidOrDataLogo: /cid:ehx-logo|data:image\/png/.test(html),
    hasAlt: /alt="ElectroHypeX/.test(html),
    hasWebsite: html.includes("electrohypex.com"),
    hasOrgOrAs: /ElectroHypeX AS/.test(html),
    hasTestprodukt: /testprodukt/i.test(html),
    hasUnknown: /Ukjent produkt|Unknown product/i.test(html),
    hasColorScheme: /color-scheme/.test(html),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
