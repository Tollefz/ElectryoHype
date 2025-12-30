/**
 * Deep clone utility function
 * 
 * Replaces clone-deep which is not compatible with Next.js/webpack bundling.
 * Uses structuredClone when available (Node 17+, modern browsers),
 * falls back to JSON.parse(JSON.stringify()) for older environments.
 * 
 * Note: JSON.parse(JSON.stringify()) has limitations:
 * - Cannot clone functions, undefined, symbols, or circular references
 * - Dates become strings
 * - For most data structures used in this app (objects, arrays, primitives), this is sufficient.
 */

export function deepClone<T>(value: T): T {
  // Use structuredClone if available (Node 17+, modern browsers)
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (error) {
      // structuredClone may fail for unsupported types (functions, symbols, etc.)
      // Fall back to JSON method
    }
  }
  
  // Fallback to JSON method for older environments or unsupported types
  // This works for plain objects, arrays, and primitives
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    // If JSON method also fails (circular reference, etc.), return shallow copy
    console.warn("[deepClone] Failed to deep clone, returning shallow copy:", error);
    if (Array.isArray(value)) {
      return [...value] as T;
    }
    if (value && typeof value === "object") {
      return { ...value } as T;
    }
    return value;
  }
}

