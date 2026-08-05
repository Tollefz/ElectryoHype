/**
 * Single source of truth for ElectroHypeX site configuration
 * Used across the entire application for consistent branding and information
 */

export const SITE_CONFIG = {
  siteName: "ElectroHypeX",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.electrohypex.com",
  supportEmail: "support@electrohypex.com",
  supportPhoneDisplay: "+47 41299063",
  supportPhoneTel: "+4741299063",
  deliveryPromise: "Levering 5–12 virkedager",
  freeShippingThreshold: 500,
  // Company info — set via env for legal footer on site + emails
  orgNumber: process.env.ORG_NUMBER || "",
  companyAddress: process.env.COMPANY_ADDRESS || "",
} as const;

