import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Toaster } from "react-hot-toast";
import { SITE_CONFIG } from "@/lib/site";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { SourceMapSuppress } from "./sourcemap-suppress";
import { AppOverlayGuard } from "@/components/AppOverlayGuard";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  // Drop 800 — map extrabold → bold in UI; keep 500 for font-medium.
  weight: ["400", "500", "600", "700"],
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
    google:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
      "ewsW0IFokVpk1pLvr1_1BY8IBvHsmeJ8mn4_7XgCkRY",
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
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="no" suppressHydrationWarning>
      <body
        className={`${sans.variable} min-h-screen bg-[var(--surface-muted)] font-sans text-[var(--text)] antialiased`}
        suppressHydrationWarning
      >
        {isDev ? <SourceMapSuppress /> : null}
        {isDev ? <AppOverlayGuard /> : null}
        <AppErrorBoundary>
          <CartProvider>
            {children}
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
      </body>
    </html>
  );
}
