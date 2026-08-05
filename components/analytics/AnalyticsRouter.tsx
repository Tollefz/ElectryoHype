"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "@/lib/analytics/ecommerce";

/** SPA page_view on App Router navigations (after marketing tags may load). */
export function AnalyticsRouter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname || "/";

    // Slight delay so gtag/fbq scripts can initialize after consent mount
    const t = window.setTimeout(() => {
      trackPageView(path);
    }, first.current ? 50 : 0);
    first.current = false;

    return () => window.clearTimeout(t);
  }, [pathname, searchParams]);

  return null;
}
