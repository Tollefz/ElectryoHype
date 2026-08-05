'use client';

/**
 * @deprecated Prefer MarketingTags via ConsentAwareAnalytics.
 * Kept for backwards-compatible imports.
 */
export { MarketingTags as GoogleAnalytics } from '@/components/analytics/MarketingTags';

import { trackPageView } from '@/lib/analytics/ecommerce';

export function useAnalytics() {
  return {
    trackEvent: (eventName: string, params?: Record<string, unknown>) => {
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
      }
    },
    trackPageView,
  };
}
