import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CartProvider } from "@/lib/cart-context";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import RefTracker from "./RefTracker";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ElektroHype - Norges beste elektronikkbutikk",
  description: "Kjøp elektronikk, gaming og tech til gode priser. Gratis frakt over 500kr. Rask levering i hele Norge.",
  keywords: ["elektronikk", "gaming", "tech", "nettbutikk", "Norge", "elektronikkbutikk"],
  openGraph: {
    title: "ElektroHype - Norges beste elektronikkbutikk",
    description: "Kjøp elektronikk, gaming og tech til gode priser. Gratis frakt over 500kr.",
    type: "website",
    locale: "no_NO",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no" suppressHydrationWarning>
      <body
        className={`${inter.variable} min-h-screen bg-slate-50 font-sans text-gray-900 antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CartProvider>
            <div className="flex min-h-screen flex-col">
              <Suspense fallback={
                <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200">
                  <div className="h-16 bg-gray-900"></div>
                </header>
              }>
                <Header />
              </Suspense>
              <Suspense fallback={null}>
                <RefTracker />
              </Suspense>
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
