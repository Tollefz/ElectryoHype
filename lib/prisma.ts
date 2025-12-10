import { PrismaClient } from "@prisma/client";
import { logError } from "@/lib/utils/logger";

const datasourceUrl = process.env.DATABASE_URL;
if (!datasourceUrl) {
  logError(
    new Error("Missing DATABASE_URL"),
    "[prisma] Check Vercel env vars (Project → Settings → Environment Variables)."
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Creates a PrismaClient instance optimized for Vercel serverless.
 * In development, reuses the same instance to avoid connection pool exhaustion.
 */
function createPrismaClient() {
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn", "query"] : ["error", "warn"],
      // Optimize for serverless: reduce connection pool size
      // Neon pooler handles connection pooling, so we can use smaller pools
    });
  } catch (err) {
    logError(err, "[prisma] Failed to initialize PrismaClient");
    throw err;
  }
}

// Singleton pattern for serverless: reuse client in development, create new in production
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In development, cache the client to avoid creating multiple instances
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

