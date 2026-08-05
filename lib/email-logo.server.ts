import "server-only";

import fs from "fs";
import path from "path";
import { EMAIL_LOGO_CID } from "@/lib/email-branding";

/**
 * Server-only: read the email logo from disk for Resend CID attachment.
 * Never import this file from Client Components.
 */
export function getEmailLogoAttachment():
  | { filename: string; content: Buffer; contentId: string; contentType: string }
  | null {
  try {
    const filePath = path.join(process.cwd(), "public", "email-logo.png");
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    if (!content.length || content.length > 200_000) return null;
    return {
      filename: "email-logo.png",
      content,
      contentId: EMAIL_LOGO_CID,
      contentType: "image/png",
    };
  } catch {
    return null;
  }
}
