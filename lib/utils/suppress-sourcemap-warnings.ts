/**
 * Suppress source map warnings in development
 * 
 * This is a known issue with Next.js/Turbopack and Prisma source maps,
 * especially on Windows. The warnings don't affect functionality.
 * 
 * This utility filters out these specific console.error messages in development only.
 */

const SOURCE_MAP_ERROR_PATTERNS = [
  /Invalid source map/i,
  /sourceMapURL could not be parsed/i,
  /Failed to parse source map/i,
  /\.next\/dev\/server\/chunks/i,
  /@prisma\/client\/runtime\/library\.js/i,
];

/**
 * Check if an error message is a source map warning
 */
function isSourceMapWarning(message: string): boolean {
  return SOURCE_MAP_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Setup source map warning suppression in development
 * This should be called once at app startup
 */
export function setupSourceMapWarningSuppression() {
  // Only in development
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // Store original console.error
  const originalError = console.error;

  // Override console.error to filter source map warnings
  console.error = (...args: any[]) => {
    // Check if any argument contains source map warning
    const hasSourceMapWarning = args.some((arg) => {
      if (typeof arg === "string") {
        return isSourceMapWarning(arg);
      }
      if (arg instanceof Error) {
        return isSourceMapWarning(arg.message) || isSourceMapWarning(arg.stack || "");
      }
      if (typeof arg === "object" && arg !== null) {
        const stringified = JSON.stringify(arg);
        return isSourceMapWarning(stringified);
      }
      return false;
    });

    // If it's a source map warning, suppress it
    if (hasSourceMapWarning) {
      return; // Don't log
    }

    // Otherwise, log normally
    originalError.apply(console, args);
  };
}

