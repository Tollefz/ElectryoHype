import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import RefTracker from "@/app/RefTracker";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { ConsentAwareAnalytics } from "@/components/ConsentAwareAnalytics";

/**
 * Storefront chrome — no headers() so pages can use ISR / Full Route Cache.
 * Admin lives outside this group (app/admin) and never mounts this layout.
 */
export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex min-h-screen flex-col">
        <Suspense
          fallback={
            <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
              <div className="h-16 bg-gray-900" />
            </header>
          }
        >
          <Header />
        </Suspense>
        <Suspense fallback={null}>
          <RefTracker />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <Suspense fallback={null}>
        <ConsentAwareAnalytics />
      </Suspense>
      <CookieConsentBanner />
    </>
  );
}
