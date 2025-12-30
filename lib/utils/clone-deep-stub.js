/**
 * Stub for clone-deep to prevent bundling in client components
 * 
 * This file replaces clone-deep in client bundles to prevent
 * "Cannot statically analyse 'require(..., ...)'" errors.
 * 
 * clone-deep is only needed server-side by puppeteer-extra,
 * so we provide an empty stub for client bundles.
 */

// Return a no-op function that throws an error if called
// This ensures that if clone-deep is accidentally used in client code,
// we get a clear error message
module.exports = function cloneDeep() {
  throw new Error(
    "clone-deep is not available in client components. " +
    "Use deepClone from '@/lib/utils/deep-clone' instead."
  );
};

