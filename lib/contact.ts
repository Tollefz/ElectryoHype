/**
 * Contact information for ElectroHypeX
 * Centralized source for contact details used across the site
 */

export const CONTACT_INFO = {
  brand: "ElectroHypeX",
  email: "support@electrohypex.com",
  phone: "+47 41299063",
  phoneLink: "tel:+4741299063", // No spaces in tel: links
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.electrohypex.com",
} as const;

