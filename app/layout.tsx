import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CartProvider } from "@/lib/cart-context";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import RefTracker from "./RefTracker";
import { Toaster } from "react-hot-toast";
import { SITE_CONFIG } from "@/lib/site";
import { SourceMapSuppress } from "./sourcemap-suppress";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { ConsentAwareAnalytics } from "@/components/ConsentAwareAnalytics";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AppOverlayGuard } from "@/components/AppOverlayGuard";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const siteUrl = SITE_CONFIG.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ElectroHypeX",
    template: "%s | ElectroHypeX",
  },
  description:
    "ElectroHypeX tilbyr populære gadgets og elektronikk til gode priser – trygg betaling via Stripe, rask kundeservice og enkle returer.",
  keywords: [
    "elektronikk",
    "gaming",
    "tech",
    "nettbutikk",
    "Norge",
    "elektronikkbutikk",
    "elektronikk tilbud",
  ],
  authors: [{ name: "ElectroHypeX" }],
  creator: "ElectroHypeX",
  publisher: "ElectroHypeX",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "no_NO",
    url: "/",
    siteName: "ElectroHypeX",
    title: "ElectroHypeX - Norges beste elektronikkbutikk",
    description:
      "ElectroHypeX tilbyr populære gadgets og elektronikk til gode priser – trygg betaling via Stripe, rask kundeservice og enkle returer.",
    images: [
      {
        url: `${siteUrl}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: "ElectroHypeX - Elektronikkbutikk",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ElectroHypeX - Norges beste elektronikkbutikk",
    description:
      "ElectroHypeX tilbyr populære gadgets og elektronikk til gode priser – trygg betaling via Stripe, rask kundeservice og enkle returer.",
    images: [`${siteUrl}/og-image.jpg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? {
          "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
        }
      : undefined,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="no" suppressHydrationWarning>
      <body
        className={`${sans.variable} min-h-screen bg-[var(--surface-muted)] font-sans text-[var(--text)] antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
        >
          <SourceMapSuppress />
          <AppOverlayGuard />
          <AppErrorBoundary>
            <CartProvider>
              <div className="flex min-h-screen flex-col">
                <Suspense
                  fallback={
                    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
                      <div className="h-16 bg-gray-900"></div>
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
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: "#0f172a",
                    color: "#fff",
                    borderRadius: "0.75rem",
                  },
                  success: {
                    iconTheme: {
                      primary: "#00c853",
                      secondary: "#fff",
                    },
                  },
                }}
              />
            </CartProvider>
          </AppErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
