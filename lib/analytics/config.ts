/**
 * Marketing / ads ID config (public + server).
 * All client tags load only after cookie consent === "all".
 *
 * Prefer GTM as the hub: set NEXT_PUBLIC_GTM_ID and configure GA/Meta/TikTok
 * inside GTM. Leave direct pixel IDs empty to avoid double-counting.
 */

export function getPublicAnalyticsConfig() {
  return {
    gtmId: process.env.NEXT_PUBLIC_GTM_ID?.trim() || "",
    gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "",
    metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "",
    tiktokPixelId: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim() || "",
    clarityId: process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || "",
    googleSiteVerification:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || "",
    bingSiteVerification:
      process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim() || "",
  };
}

export function getServerAnalyticsConfig() {
  return {
    ...getPublicAnalyticsConfig(),
    metaAccessToken: process.env.META_CAPI_ACCESS_TOKEN?.trim() || "",
    metaPixelIdServer:
      process.env.META_PIXEL_ID?.trim() ||
      process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
      "",
    gaApiSecret: process.env.GA4_API_SECRET?.trim() || "",
    gaMeasurementIdServer:
      process.env.GA4_MEASUREMENT_ID?.trim() ||
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ||
      "",
  };
}

export function hasAnyClientAnalytics(): boolean {
  const c = getPublicAnalyticsConfig();
  return Boolean(
    c.gtmId ||
      c.gaMeasurementId ||
      c.metaPixelId ||
      c.tiktokPixelId ||
      c.clarityId
  );
}
