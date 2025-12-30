import { PrismaClient } from "@prisma/client";
import { logError } from "@/lib/utils/logger";

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
    const client = new PrismaClient({
      log: process.env.NODE_ENV === "development" 
        ? ["error", "warn", "query"] 
        : ["error", "warn"],
      // Note: Connection pooling is handled by Neon pooler in production
      // No need to configure connection pool size manually
    });
    
    // In development, test connection on startup (non-blocking)
    if (process.env.NODE_ENV === "development") {
      client.$connect().catch((err) => {
        console.error("❌ [Prisma] Failed to connect to database:");
        console.error("   Error:", err.message);
        if (err.cause) {
          console.error("   Cause:", err.cause);
        }
        console.error("   Check:");
        console.error("   1. DATABASE_URL is correct in .env");
        console.error("   2. Database is accessible (check Neon Dashboard)");
        console.error("   3. Network/firewall allows connection");
        console.error("   4. Database credentials are valid");
      });
    }
    
    return client;
  } catch (err: any) {
    const isDev = process.env.NODE_ENV === "development";
    
    if (isDev) {
      console.error("❌ [Prisma] Failed to initialize PrismaClient:");
      console.error("   Error:", err?.message || "Unknown error");
      if (err?.cause) {
        console.error("   Cause:", err.cause);
      }
      if (err?.stack) {
        console.error("   Stack:", err.stack);
      }
      
      // Common error messages and fixes
      if (err?.message?.includes("Can't reach database server")) {
        console.error("\n💡 Fix: Check DATABASE_URL and ensure database is running");
      } else if (err?.message?.includes("authentication failed")) {
        console.error("\n💡 Fix: Check database credentials in DATABASE_URL");
      } else if (err?.message?.includes("does not exist")) {
        console.error("\n💡 Fix: Database name in DATABASE_URL may be incorrect");
      }
    }
    
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

