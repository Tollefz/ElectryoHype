import { isDevelopment, isDatabaseConfigured } from "@/lib/utils/database-check";

/**
 * Run a Prisma/database query safely without crashing the app.
 * On failure it logs and returns the provided fallback value.
 * 
 * In development: If database is not configured, silently returns fallback.
 * In production: Always logs errors and returns fallback.
 */
export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isDev = isDevelopment();
    const dbConfigured = isDatabaseConfigured();
    
    // In development, if DB is not configured, silently return fallback
    if (isDev && !dbConfigured) {
      // Don't log errors in dev when DB is not configured - it's expected
      return fallback;
    }
    
    // Otherwise, log the error
    const errorMessage = error?.message || String(error);
    const errorName = error?.name || "UnknownError";
    
    if (isDev) {
      console.error(
        `❌ Failed to run query${label ? ` (${label})` : ''}`,
        {
          error: errorMessage,
          name: errorName,
          ...(error?.cause && { cause: error.cause }),
        }
      );
    } else {
      // In production, log but don't expose details
      console.error(
        `Failed to run query${label ? ` (${label})` : ''}`,
        errorMessage
      );
    }
    
    return fallback;
  }
}

