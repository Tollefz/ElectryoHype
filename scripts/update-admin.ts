/**
 * Update/create admin from env — never hardcode passwords in source.
 * Run: npx tsx scripts/update-admin.ts
 * Requires ADMIN_EMAIL + ADMIN_PASSWORD in .env
 */
import "dotenv/config";
import { hash } from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  console.log("Updating admin user from ADMIN_EMAIL env…");

  const passwordHash = await hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail.trim().toLowerCase() },
    create: {
      email: adminEmail.trim().toLowerCase(),
      password: passwordHash,
      role: "admin",
      name: "Admin",
    },
    update: {
      password: passwordHash,
      role: "admin",
    },
  });

  console.log("Admin upsert OK");
  console.log(`id=${admin.id}`);
  console.log(`email=${admin.email}`);
  console.log("Password hash updated (plaintext not logged).");
}

main()
  .catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("update-admin failed:", msg.slice(0, 200));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
