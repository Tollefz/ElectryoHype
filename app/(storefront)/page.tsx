import {
  Truck,
  Shield,
  CreditCard,
  Headphones,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import type { Metadata } from "next";
import { NewsletterForm } from "@/components/NewsletterForm";
import { isDevelopment } from "@/lib/utils/database-check";
import HomeHero from "@/components/home/HomeHero";
import HomeCategoryGrid from "@/components/home/HomeCategoryGrid";
import HomeProductSection from "@/components/home/HomeProductSection";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getHomePageData } from "@/lib/storefront/get-home-page-data";
import type { HomeProduct } from "@/lib/storefront/home-product-distribution";
import { SITE_CONFIG } from "@/lib/site";
import { getCategoryByDbValue } from "@/lib/categories";
import {
  generateOrganizationJSONLD,
  generateWebsiteJSONLD,
} from "@/lib/seo";

/** Cache homepage HTML + data briefly — biggest TTFB win vs force-dynamic. */
export const revalidate = 60;

const baseUrl = process.env.NEXTAUTH_URL || "https://www.electrohypex.com";

export const metadata: Metadata = {
  title: "ElectroHypeX - Beste elektronikk til beste priser",
  description:
    "Kjøp elektronikk, gaming-utstyr, mobil og tilbehør til beste priser. Gratis frakt over 500 kr. Rask levering i hele Norge.",
  keywords: [
    "elektronikk",
    "gaming",
    "mobil",
    "tilbehør",
    "Norge",
    "nettbutikk",
    "elektronikkbutikk",
  ],
  openGraph: {
    title: "ElectroHypeX - Beste elektronikk til beste priser",
    description:
      "Kjøp elektronikk, gaming-utstyr, mobil og tilbehør til beste priser. Gratis frakt over 500 kr.",
    type: "website",
    url: baseUrl,
    siteName: "ElectroHypeX",
    images: [
      {
        url: `${baseUrl}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: "ElectroHypeX - Elektronikkbutikk",
      },
    ],
    locale: "nb_NO",
  },
  twitter: {
    card: "summary_large_image",
    title: "ElectroHypeX - Beste elektronikk til beste priser",
    description:
      "Kjøp elektronikk, gaming-utstyr, mobil og tilbehør til beste priser.",
    images: [`${baseUrl}/og-image.jpg`],
  },
  alternates: {
    canonical: baseUrl,
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
};

function parseFirstImage(raw: string): string | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const arr = Array.isArray(parsed) ? parsed : [];
    const first = arr.find(
      (u: unknown) =>
        typeof u === "string" &&
        u.startsWith("http") &&
        !u.includes("placehold")
    );
    return typeof first === "string" ? first : null;
  } catch {
    return null;
  }
}

function productImage(p: HomeProduct): string | null {
  if (p.imageUrl && p.imageUrl.startsWith("http")) return p.imageUrl;
  return parseFirstImage(p.images);
}

function sectionStatus(
  loadError: string | null,
  products: HomeProduct[]
): "error" | "empty" | "success" {
  if (loadError) return "error";
  if (products.length === 0) return "empty";
  return "success";
}

function categoryImageFromPools(
  categoryName: string,
  pools: HomeProduct[][]
): string | null {
  const needle = categoryName.toLowerCase();
  const tokens = needle
    .split(/[\s&/,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  for (const pool of pools) {
    for (const p of pool) {
      const label =
        getCategoryByDbValue(p.category)?.label?.toLowerCase() ||
        p.category?.toLowerCase() ||
        "";
      const hit =
        label === needle ||
        tokens.some((t) => label.includes(t)) ||
        tokens.some((t) => needle.includes(t) && label.includes(t));
      if (!hit) continue;
      const img = productImage(p);
      if (img) return img;
    }
  }
  return null;
}

export default async function HomePage() {
  // Avoid headers() here — it forces dynamic rendering and kills ISR/TTFB.
  // Single-store ElectroHypeX uses DEFAULT_STORE_ID (same as host fallback).
  const primaryStoreId = DEFAULT_STORE_ID;
  const isDev = isDevelopment();

  const result = await getHomePageData(primaryStoreId);

  const sections = result.ok ? result.data.sections : null;
  const categories = result.ok ? result.data.categories : [];
  const dbNotConfigured = result.ok ? result.data.dbNotConfigured : false;
  const loadError = result.ok
    ? null
    : result.error.reason || "Kunne ikke laste produkter akkurat nå.";

  const popular = sections?.popular ?? [];
  const deals = sections?.deals ?? [];
  const newest = sections?.newest ?? [];
  const mobil = sections?.mobil ?? [];
  const gaming = sections?.gaming ?? [];
  const data = sections?.data ?? [];
  const tv = sections?.tv ?? [];
  const hjem = sections?.hjem ?? [];

  const imagePools = [gaming, mobil, data, tv, hjem, popular, deals, newest];

  return (
    <main className="ehx-page-bg ehx-home min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateOrganizationJSONLD()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateWebsiteJSONLD()),
        }}
      />
      {isDev && dbNotConfigured && (
        <div className="border-b-2 border-yellow-400 bg-yellow-50">
          <div className="ehx-container py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
              <div className="flex-1">
                <h3 className="mb-1 text-sm font-semibold text-yellow-800">
                  Database not configured
                </h3>
                <p className="mb-2 text-sm text-yellow-700">
                  DATABASE_URL is missing or invalid. The app is running in
                  development mode with empty data.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <HomeHero />

      <section className="ehx-section-tight border-b border-[var(--border)] bg-white">
        <div className="ehx-container py-3.5 sm:py-4">
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5 md:gap-3">
            <div className="flex items-center gap-2.5">
              <Truck
                className="h-6 w-6 shrink-0 text-[var(--brand)] sm:h-7 sm:w-7"
                strokeWidth={1.75}
              />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-[var(--text)] sm:text-sm">
                  Fri frakt
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Over {SITE_CONFIG.freeShippingThreshold},-
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <RotateCcw
                className="h-6 w-6 shrink-0 text-[var(--brand)] sm:h-7 sm:w-7"
                strokeWidth={1.75}
              />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-[var(--text)] sm:text-sm">
                  30 dagers retur
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Åpent kjøp
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Shield
                className="h-6 w-6 shrink-0 text-[var(--brand)] sm:h-7 sm:w-7"
                strokeWidth={1.75}
              />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-[var(--text)] sm:text-sm">
                  Trygg handel
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Norsk nettbutikk
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <CreditCard
                className="h-6 w-6 shrink-0 text-[var(--brand)] sm:h-7 sm:w-7"
                strokeWidth={1.75}
              />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-[var(--text)] sm:text-sm">
                  Kortbetaling
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Trygg via Stripe
                </p>
              </div>
            </div>
            <div className="col-span-2 flex items-center gap-2.5 md:col-span-1">
              <Headphones
                className="h-6 w-6 shrink-0 text-[var(--brand)] sm:h-7 sm:w-7"
                strokeWidth={1.75}
              />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-[var(--text)] sm:text-sm">
                  Kundeservice
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Man–Fre 09–18
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="ehx-container py-4">
          <div className="rounded-[var(--ehx-radius-md)] border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <p className="font-semibold">Kunne ikke laste produkter akkurat nå</p>
            <p className="mt-1 text-sm text-amber-900/90">{loadError}</p>
          </div>
        </div>
      ) : (
        <HomeCategoryGrid
          categories={categories.map((c) => ({
            name: c.name,
            count: c.count,
            href: `/products?category=${encodeURIComponent(c.slug)}`,
            imageUrl: categoryImageFromPools(c.name, imagePools),
          }))}
        />
      )}

      <HomeProductSection
        title="Ukens tilbud"
        href="/tilbud"
        linkLabel="Se alle tilbud"
        products={deals}
        badge="Spar opptil 25%"
        tone="muted"
        status={sectionStatus(loadError, deals)}
        error={loadError}
        limit={4}
        columns={4}
      />

      <HomeProductSection
        title="Populære produkter"
        href="/products"
        linkLabel="Se alle produkter"
        products={popular}
        tone="default"
        status={sectionStatus(loadError, popular)}
        error={loadError}
        limit={4}
      />

      <HomeProductSection
        title="Nyheter"
        href="/products?sort=newest"
        linkLabel="Se nyheter"
        products={newest}
        tone="plain"
        status={sectionStatus(loadError, newest)}
        error={loadError}
        limit={4}
        deferPaint
      />

      {!loadError && mobil.length > 0 ? (
        <HomeProductSection
          title="Mobil & Tilbehør"
          href="/products?category=mobil"
          linkLabel="Se mobil"
          products={mobil}
          tone="default"
          status="success"
          limit={4}
          deferPaint
        />
      ) : null}

      {!loadError && gaming.length > 0 ? (
        <HomeProductSection
          title="Gaming"
          href="/products?category=gaming"
          linkLabel="Se gaming"
          products={gaming}
          tone="muted"
          status="success"
          limit={4}
          deferPaint
        />
      ) : null}

      {!loadError && data.length > 0 ? (
        <HomeProductSection
          title="Data & IT"
          href="/products?category=data"
          linkLabel="Se data & IT"
          products={data}
          tone="plain"
          status="success"
          limit={4}
          deferPaint
        />
      ) : null}

      {!loadError && tv.length > 0 ? (
        <HomeProductSection
          title="TV, Lyd & Bilde"
          href="/products?category=tv"
          linkLabel="Se TV & lyd"
          products={tv}
          tone="default"
          status="success"
          limit={4}
          deferPaint
        />
      ) : null}

      {!loadError && hjem.length > 0 ? (
        <HomeProductSection
          title="Hjem & Fritid"
          href="/products?category=hjem"
          linkLabel="Se hjem"
          products={hjem}
          tone="muted"
          status="success"
          limit={4}
          deferPaint
        />
      ) : null}

      <section className="ehx-section bg-[var(--navy)]">
        <div className="ehx-container text-center">
          <h2 className="mb-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            Få eksklusive tilbud rett i innboksen
          </h2>
          <p className="mb-6 text-sm text-slate-400 sm:text-base">
            Meld deg på nyhetsbrevet for tilbud og produktnyheter.
          </p>
          <NewsletterForm />
        </div>
      </section>
    </main>
  );
}
