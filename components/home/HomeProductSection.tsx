"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import {
  TrackPromotionView,
} from "@/components/analytics/TrackEvents";
import { trackEcommerce } from "@/lib/analytics/ecommerce";

type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: string;
  category: string | null;
  imageUrl?: string | null;
};

type SectionStatus = "success" | "empty" | "error";

interface HomeProductSectionProps {
  title: string;
  href: string;
  linkLabel?: string;
  products: Product[];
  badge?: string;
  tone?: "default" | "muted" | "plain";
  status?: SectionStatus;
  error?: string | null;
  /** Cap products shown (layout density). */
  limit?: number;
  /** Use 4-column grid (Ukens tilbud). */
  columns?: 4 | 5;
  promotionId?: string;
}

export default function HomeProductSection({
  title,
  href,
  linkLabel = "Se alle",
  products,
  badge,
  tone = "default",
  status: statusProp,
  error,
  limit,
  columns = 5,
  promotionId,
}: HomeProductSectionProps) {
  const status: SectionStatus =
    statusProp ||
    (error ? "error" : products.length === 0 ? "empty" : "success");

  const bg =
    tone === "muted"
      ? "bg-[var(--surface-muted)]"
      : tone === "plain"
        ? "bg-transparent"
        : "bg-white";

  const shown = typeof limit === "number" ? products.slice(0, limit) : products;
  const gridClass =
    columns === 4 ? "ehx-product-grid-4" : "ehx-product-grid";

  const promoId = promotionId || (badge ? `home-${title}` : undefined);

  const onPromoSelect = () => {
    if (!promoId) return;
    trackEcommerce("select_promotion", {
      promotion_id: promoId,
      promotion_name: title,
      creative_name: badge || title,
      creative_slot: "home_section",
    });
  };

  return (
    <section className={`ehx-section ${bg}`}>
      {promoId ? (
        <TrackPromotionView
          promotionId={promoId}
          promotionName={title}
          creativeName={badge || title}
          creativeSlot="home_section"
        />
      ) : null}
      <div className="ehx-container">
        <div className="mb-3.5 flex flex-col items-start justify-between gap-2 sm:mb-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="ehx-heading-2">{title}</h2>
            {badge ? (
              <span className="rounded-md bg-[var(--danger)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                {badge}
              </span>
            ) : null}
          </div>
          <Link
            href={href}
            onClick={onPromoSelect}
            className="hidden items-center gap-0.5 text-sm font-semibold text-[var(--brand-dark)] transition hover:underline sm:flex"
          >
            {linkLabel} <ChevronRight size={16} />
          </Link>
        </div>

        {status === "error" ? (
          <div className="rounded-[var(--ehx-radius-md)] border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <p className="font-semibold">Kunne ikke laste produkter</p>
            <p className="mt-1 text-sm text-amber-900/90">
              {error || "Databasen svarte ikke. Prøv igjen om litt."}
            </p>
          </div>
        ) : status === "empty" ? (
          <div className="rounded-[var(--ehx-radius-md)] border border-dashed border-[var(--border)] bg-white p-6 text-center text-[var(--text-secondary)]">
            Ingen produkter i denne seksjonen ennå.
          </div>
        ) : (
          <div className={gridClass}>
            {shown.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  ...product,
                  imageUrl: product.imageUrl ?? undefined,
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-4 sm:hidden">
          <Link
            href={href}
            onClick={onPromoSelect}
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-[var(--brand-dark)]"
          >
            {linkLabel} <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
