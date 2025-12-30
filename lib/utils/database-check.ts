/**
 * Check if database is properly configured
 * Returns true if DATABASE_URL is set and valid
 */
export function isDatabaseConfigured(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl || databaseUrl.trim() === "") {
    return false;
  }
  
  // Basic validation: check if it looks like a database URL
  try {
    const url = new URL(databaseUrl);
    // Should be postgresql:// or postgres://
    if (!url.protocol.startsWith("postgres")) {
      return false;
    }
    return true;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Check if we should use dev-safe fallbacks
 * Only in development, and only if database is not configured
 */
export function shouldUseDevFallback(): boolean {
  return isDevelopment() && !isDatabaseConfigured();
}

