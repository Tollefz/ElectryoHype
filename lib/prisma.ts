import { PrismaClient } from "@prisma/client";

const datasourceUrl = process.env.DATABASE_URL;
if (!datasourceUrl) {
  console.error(
    "[prisma] Missing DATABASE_URL. Check Vercel env vars (Project → Settings → Environment Variables)."
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  try {
    return new PrismaClient({
      log: ["error", "warn"],
    });
  } catch (err) {
    console.error("[prisma] Failed to initialize PrismaClient", err);
    throw err;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

