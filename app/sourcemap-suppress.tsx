"use client";

/**
 * Client component to suppress source map warnings in development
 * 
 * This is a known issue with Next.js/Turbopack and Prisma source maps,
 * especially on Windows. The warnings don't affect functionality.
 * 
 * This component filters out these specific console.error messages in development only.
 */

import { useEffect } from "react";

const SOURCE_MAP_ERROR_PATTERNS = [
  /Invalid source map/i,
  /sourceMapURL could not be parsed/i,
  /Failed to parse source map/i,
  /\.next\/dev\/server\/chunks/i,
  /@prisma\/client\/runtime\/library\.js/i,
];

function isSourceMapWarning(message: string): boolean {
  return SOURCE_MAP_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

export function SourceMapSuppress() {
  useEffect(() => {
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
          try {
            const stringified = JSON.stringify(arg);
            return isSourceMapWarning(stringified);
          } catch {
            // If stringify fails, check toString
            return isSourceMapWarning(String(arg));
          }
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

    // Cleanup: restore original on unmount
    return () => {
      console.error = originalError;
    };
  }, []);

  return null; // This component doesn't render anything
}

