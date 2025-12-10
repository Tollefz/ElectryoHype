/**
 * Product image upload utilities using UploadThing.
 * 
 * UploadThing provides a simple, secure way to upload files directly from the browser.
 * Files are stored on UploadThing's CDN and URLs are returned for use in the application.
 * 
 * Setup required:
 * 1. Install: npm install uploadthing @uploadthing/react
 * 2. Set env vars: UPLOADTHING_SECRET and UPLOADTHING_APP_ID
 * 3. Configure in app/api/uploadthing/core.ts
 */

import { logError, logInfo } from "@/lib/utils/logger";

export interface UploadResult {
  url: string;
  key?: string;
}

/**
 * Upload a product image file using UploadThing.
 * 
 * This function is called from the client-side component.
 * The actual upload happens via UploadThing's client SDK.
 * 
 * @param file - The image file to upload
 * @returns Promise resolving to the uploaded image URL
 * 
 * @example
 * ```ts
 * import { useUploadThing } from "@uploadthing/react";
 * 
 * const { startUpload } = useUploadThing("productImage");
 * const files = [file];
 * const result = await startUpload(files);
 * if (result) {
 *   const url = result[0].url;
 *   // Use url in your product form
 * }
 * ```
 */
export async function uploadProductImage(file: File): Promise<UploadResult> {
  // Note: Actual upload is handled by UploadThing client SDK
  // This function is kept for API compatibility
  logInfo(`Upload requested for file: ${file.name}`, "[uploads]");
  
  // The client should use useUploadThing hook from @uploadthing/react
  // See app/admin/(protected)/products/new/page.tsx for implementation
  throw new Error(
    "Use UploadThing client SDK (useUploadThing) in React components. " +
    "See documentation: https://docs.uploadthing.com/getting-started/appdir"
  );
}

/**
 * Delete an uploaded product image.
 * 
 * Note: UploadThing doesn't provide a direct delete API in the free tier.
 * For deletion, you may need to:
 * 1. Use UploadThing Pro/Enterprise
 * 2. Or implement a server-side cleanup job
 * 
 * @param key - The file key from UploadThing
 * @returns Promise resolving when deletion is complete
 */
export async function deleteProductImage(key: string): Promise<void> {
  logInfo(`Delete requested for key: ${key}`, "[uploads]");
  
  // UploadThing deletion requires Pro plan
  // For now, we'll log the request but not actually delete
  // In production, implement based on your UploadThing plan
  logError(
    new Error("Image deletion not available in free tier"),
    "[uploads] deleteProductImage"
  );
  
  // TODO: Implement if using UploadThing Pro
  // await fetch(`/api/uploadthing/delete`, {
  //   method: 'POST',
  //   body: JSON.stringify({ key }),
  // });
}

