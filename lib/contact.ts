/**
 * Contact information for ElectroHypeX
 * Centralized source for contact details used across the site
 * 
 * @deprecated Use SITE_CONFIG from @/lib/site instead
 * This file is kept for backward compatibility
 */

import { SITE_CONFIG } from './site';

export const CONTACT_INFO = {
  brand: SITE_CONFIG.siteName,
  email: SITE_CONFIG.supportEmail,
  phone: SITE_CONFIG.supportPhoneDisplay,
  phoneLink: `tel:${SITE_CONFIG.supportPhoneTel}`,
  siteUrl: SITE_CONFIG.siteUrl,
} as const;

