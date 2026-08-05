import { PrismaClient } from "@prisma/client";
import { logError } from "@/lib/utils/logger";
import { recordDbQuery, dbMetricsEnabled } from "@/lib/db/query-metrics";

const datasourceUrl = process.env.DATABASE_URL;

// Enhanced error checking for DATABASE_URL
if (!datasourceUrl) {
  const error = new Error("Missing DATABASE_URL environment variable");
  const isDev = process.env.NODE_ENV === "development";
  
  if (isDev) {
    console.error("❌ [Prisma] DATABASE_URL is missing!");
    console.error("📝 To fix:");
    console.error("   1. Create a .env file in the project root");
    console.error("   2. Add: DATABASE_URL=\"postgresql://user:password@host/database?sslmode=require\"");
    console.error("   3. Get your DATABASE_URL from Neon Dashboard → Connection Details");
    console.error("   4. Restart the dev server (npm run dev)");
  }
  
  logError(error, "[prisma] Missing DATABASE_URL. Check .env file or Vercel env vars.");
}

// Validate DATABASE_URL format in development
if (datasourceUrl && process.env.NODE_ENV === "development") {
  try {
    const url = new URL(datasourceUrl);
    if (!url.protocol.startsWith("postgres")) {
      console.warn("⚠️ [Prisma] DATABASE_URL should start with 'postgresql://'");
    }
  } catch {
    console.warn("⚠️ [Prisma] DATABASE_URL format may be invalid");
  }
}

/**
 * Global type augmentation for Prisma singleton pattern
 * This ensures TypeScript knows about the prisma property on globalThis
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Creates a PrismaClient instance optimized for Next.js and Vercel serverless.
 * 
 * Best practices:
 * - In development: Reuse the same instance via globalThis to avoid connection pool exhaustion during hot reload
 * - In production: Create new instance per serverless function (Vercel handles this automatically)
 * - Never use Prisma in Edge Runtime (not supported)
 */
function createPrismaClient(): PrismaClient {
  try {
    // Avoid Prisma's default console.error(Error) — it opens Next Dev Issues.
    // Technical detail goes through admin-logger / stderr strings only.
    const debugPrisma = process.env.NEXT_PUBLIC_DEBUG === "true";
    const base = new PrismaClient({
      log: debugPrisma
        ? [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [],
    });

    // DEV metrics via $extends (Prisma 6 — $use removed)
    const client = dbMetricsEnabled()
      ? base.$extends({
          query: {
            $allModels: {
              async $allOperations({ model, operation, args, query }) {
                recordDbQuery(model, operation);
                return query(args);
              },
            },
          },
        })
      : base;

    // Soft connect probe — never throw; never console.error(Error)
    // Skip auto-connect when DATABASE_URL points at unreachable Neon during quota lock
    if (
      process.env.NODE_ENV === "development" &&
      process.env.PRISMA_SKIP_CONNECT !== "1"
    ) {
      void (client as PrismaClient).$connect().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[prisma] connect failed: ${msg.slice(0, 200)}`);
      });
    }

    return client as unknown as PrismaClient;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[prisma] Failed to initialize PrismaClient: ${msg.slice(0, 200)}`);
    logError(err, "[prisma] Failed to initialize PrismaClient");
    throw err;
  }
}

/**
 * Prisma Client singleton instance
 * 
 * Next.js best practice pattern:
 * - In development: Reuse the same instance via globalThis to prevent multiple instances during hot reload
 * - In production: Vercel serverless functions create new instances per invocation (this is fine)
 * 
 * IMPORTANT: Prisma does NOT work in Edge Runtime. All routes using Prisma must use Node.js runtime (default).
 * If you see "Invalid prisma.product.findMany invocation", check that the route doesn't have `export const runtime = "edge"`
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

// In development, cache the client on globalThis to prevent multiple instances during hot reload
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

