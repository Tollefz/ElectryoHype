import "dotenv/config";
import { hash } from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "rob.tol@hotmail.com";
  const adminPassword = "Tollef220900";

  console.log("🔄 Oppdaterer admin-bruker...");
  console.log(`📧 Email: ${adminEmail}`);

  const passwordHash = await hash(adminPassword, 12);

  // Oppdater eller opprett admin-bruker
  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    create: {
      email: adminEmail.toLowerCase(),
      password: passwordHash,
      role: "admin",
      name: "Admin",
    },
    update: {
      email: adminEmail.toLowerCase(),
      password: passwordHash,
      role: "admin",
    },
  });

  console.log("✅ Admin-bruker oppdatert/opprettet!");
  console.log(`📧 Email: ${admin.email}`);
  console.log(`👤 ID: ${admin.id}`);
  console.log(`🔑 Passord: ${adminPassword}`);
  console.log("\n💡 Du kan nå logge inn med:");
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Passord: ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error("❌ Feil ved oppdatering:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

