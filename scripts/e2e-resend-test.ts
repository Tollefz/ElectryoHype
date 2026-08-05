/**
 * E2E Resend verification:
 * 1) List domains + status
 * 2) Validate EMAIL_FROM against verified domains
 * 3) Send customer confirmation + admin notification for a real order
 * 4) Confirm DB SENT
 *
 * Usage (PowerShell):
 *   $env:RESEND_API_KEY="re_..."; npx tsx scripts/e2e-resend-test.ts
 * Or put the key in .env first, then:
 *   npx tsx scripts/e2e-resend-test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";

const prisma = new PrismaClient();
const TARGET = process.env.E2E_EMAIL_TO || "rob.tol@hotmail.com";

interface ResendDomain {
  name: string;
  status: string;
  capabilities?: { sending?: boolean };
}

function parseFrom(from: string): { name?: string; email: string; domain: string } {
  const m = from.match(/^(?:(.+?)\s*)?<([^>]+)>$|^([^\s<>]+)$/);
  const email = (m?.[2] || m?.[3] || "").trim().toLowerCase();
  const domain = email.split("@")[1] || "";
  return { name: m?.[1]?.trim(), email, domain };
}

async function main() {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) {
    console.error("FAIL: RESEND_API_KEY is empty. Add it to .env or set $env:RESEND_API_KEY");
    process.exit(1);
  }

  let from = (process.env.EMAIL_FROM || "").trim();
  if (!from) from = "ElectroHypeX <beth.t@example.com>";

  const resend = new Resend(key);

  console.log("=== 1) Domains ===");
  const domainsResp = await resend.domains.list();
  if (domainsResp.error) {
    console.error("domains.list error:", domainsResp.error);
    process.exit(1);
  }
  const domainsRaw = domainsResp.data?.data || domainsResp.data || [];
  const domains: ResendDomain[] = Array.isArray(domainsRaw) ? domainsRaw : [];
  for (const d of domains) {
    console.log(`- ${d.name}: status=${d.status} sending=${d.capabilities?.sending}`);
  }

  // Resend uses status "verified" when ready
  const readyDomains = domains
    .filter((d) => String(d.status).toLowerCase() === "verified")
    .map((d) => String(d.name).toLowerCase());

  console.log("verifiedDomains:", readyDomains);

  console.log("=== 2) EMAIL_FROM check ===");
  let parsed = parseFrom(from);
  console.log("configured EMAIL_FROM:", from, "→ domain:", parsed.domain);

  const onboardingOk = parsed.domain === "resend.dev";
  const customOk = readyDomains.includes(parsed.domain);

  if (!onboardingOk && !customOk) {
    const recommended = readyDomains.length
      ? `ElectroHypeX <noreply@${readyDomains[0]}>`
      : "ElectroHypeX <beth.t@example.com>";
    console.warn("EMAIL_FROM domain is NOT verified in Resend.");
    console.warn("Recommended EMAIL_FROM:", recommended);
    from = recommended;
    parsed = parseFrom(from);
    process.env.EMAIL_FROM = from;
    console.log("Using recommended from for this test:", from);
  } else {
    console.log("EMAIL_FROM domain OK for sending");
  }

  // Ensure email module sees env
  process.env.EMAIL_FROM = from;
  if (!(process.env.ADMIN_EMAIL || "").trim()) {
    process.env.ADMIN_EMAIL = TARGET;
    console.log("ADMIN_EMAIL was empty — temporarily set to", TARGET, "for this test");
  }

  console.log("=== 3) Prepare order with customer email", TARGET, "===");
  let order = await prisma.order.findFirst({
    where: { customer: { email: TARGET } },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  if (!order) {
    order = await prisma.order.findFirst({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
    if (!order?.customer) {
      console.error("No order with customer found");
      process.exit(1);
    }
    await prisma.customer.update({
      where: { id: order.customer.id },
      data: { email: TARGET },
    });
    console.log("Updated customer email on order", order.orderNumber, "→", TARGET);
  }

  // Reset email statuses so we can observe SENT transition
  await prisma.order.update({
    where: { id: order.id },
    data: {
      customerEmailStatus: "NOT_SENT",
      customerEmailLastError: null,
      customerEmailSentAt: null,
      adminEmailStatus: "NOT_SENT",
      adminEmailSentAt: null,
    },
  });

  console.log("=== 4) Send customer confirmation + admin notification ===");
  const { sendOrderConfirmation, sendAdminNotification, getEmailEnvStatus } = await import(
    "../lib/email.ts"
  );
  console.log("envStatus:", getEmailEnvStatus());

  const customerResult = await sendOrderConfirmation(order.id);
  console.log("customerResult:", customerResult);

  const adminResult = await sendAdminNotification(order.id);
  console.log("adminResult:", adminResult);

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      orderNumber: true,
      customerEmailStatus: true,
      customerEmailSentAt: true,
      customerEmailLastError: true,
      adminEmailStatus: true,
      adminEmailSentAt: true,
      customer: { select: { email: true } },
    },
  });
  console.log("=== 5) DB after ===");
  console.log(after);

  // Also try a raw Resend send for delivery proof id
  const probe = await resend.emails.send({
    from,
    to: TARGET,
    subject: `ElectroHypeX E2E probe ${new Date().toISOString()}`,
    text: `Probe email from ElectroHypeX E2E test. Order ${order.orderNumber}. From=${from}`,
  });
  console.log("=== 6) Raw Resend probe ===");
  console.log(probe);

  const ok =
    customerResult.success &&
    adminResult.success &&
    after?.customerEmailStatus === "SENT" &&
    after?.adminEmailStatus === "SENT" &&
    !probe.error;

  if (!ok) {
    console.error("E2E FAILED");
    process.exit(1);
  }

  console.log("E2E OK — Resend accepted sends; DB statuses SENT. Check inbox:", TARGET);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
