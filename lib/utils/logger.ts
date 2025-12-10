/**
 * Global minimal logger for consistent error logging across the application.
 * Use this instead of console.error directly for better error tracking.
 */
export function logError(err: any, ctx: string) {
  const message = err?.message || String(err);
  const stack = err?.stack;
  
  console.error("🔥 ERROR:", ctx, message);
  if (stack && process.env.NODE_ENV === "development") {
    console.error("Stack:", stack);
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

