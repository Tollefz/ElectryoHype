import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
        className={`${inter.variable} min-h-screen bg-background font-sans text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CartProvider>
            <div className="flex min-h-screen flex-col">
              <Header />
              <RefTracker />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
