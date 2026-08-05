/**
 * Global minimal logger for consistent error logging across the application.
 * Use this instead of console.error directly for better error tracking.
 */
export function logError(err: unknown, ctx: string) {
  const error = err as { message?: string; stack?: string };
  const message = error?.message || String(err);
  // String-only — Error objects in console.error open Next Dev Issues
  console.warn(`🔥 ERROR: ${ctx} ${message}`);
  if (error?.stack && process.env.NEXT_PUBLIC_DEBUG === "true") {
    console.warn(`Stack: ${error.stack.slice(0, 2000)}`);
  }
}

/**
 * Log warning messages with context.
 */
export function logWarning(message: string, ctx: string) {
  console.warn("⚠️  WARNING:", ctx, message);
}

/**
 * Log info messages with context (only in development).
 */
export function logInfo(message: string, ctx: string) {
  if (process.env.NODE_ENV === "development") {
    console.log("ℹ️  INFO:", ctx, message);
  }
}

