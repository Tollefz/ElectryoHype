import Link from "next/link";
import { Star } from "lucide-react";
import { storefrontProductTitle } from "@/lib/storefront/product-title";
import { getCategoryByDbValue } from "@/lib/categories";
import { getAvailability } from "@/lib/products/availability";
import { SITE_CONFIG } from "@/lib/site";
import { ProductCardMedia } from "@/components/ProductCardMedia";
import { ProductCardQuickAdd } from "@/components/ProductCardQuickAdd";

interface ProductCardProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number | null;
  images?: string | string[];
  imageUrl?: string | null;
  category?: string | null;
  stock?: number | null;
  variants?: Array<{ stock?: number | null }>;
  isActive?: boolean | null;
  isNew?: boolean | null;
  metaTitle?: string | null;
}

interface ProductCardProps {
  product: ProductCardProduct;
  /** Show star ratings — off by default (no real review backend yet). */
  showRating?: boolean;
}

/** Stable display rating for storefront chrome (no review backend yet). */
function displaySocialProof(id: string): { rating: number; reviews: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  const rating = 4.2 + (h % 8) / 10;
  const reviews = 18 + (h % 220);
  return { rating, reviews };
}

function parseImages(product: ProductCardProduct): string[] {
  try {
    if (typeof product.images === "string") {
      try {
        const parsed = JSON.parse(product.images);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        if (product.images && product.images.startsWith("http")) {
          return [product.images];
        }
      }
    } else if (Array.isArray(product.images)) {
      return product.images;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function isValidUrl(url: string) {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return url.startsWith("http") && !url.includes("placehold.co");
  } catch {
    return false;
  }
}

/**
 * RSC product card — only media hover + quick-add hydrate as client islands.
 */
function ProductCard({ product, showRating = false }: ProductCardProps) {
  const social = displaySocialProof(product.id);
  const images = parseImages(product);
  const validImages = images.filter((img) => isValidUrl(img));
  const mainImage =
    product.imageUrl && isValidUrl(product.imageUrl)
      ? product.imageUrl
      : validImages[0] || "";
  const cleanedName = storefrontProductTitle({
    name: product.name,
    metaTitle: product.metaTitle,
  });

  const compareAtPrice = product.compareAtPrice ?? null;
  const hasDiscount =
    compareAtPrice !== null && compareAtPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price / compareAtPrice) * 100)
    : 0;

  const availability = getAvailability({
    stock: product.stock || 0,
    variants: (product.variants || []).map((v) => ({
      stock: v.stock ?? 0,
    })),
    isActive: product.isActive !== false,
  });

  const categoryLabel =
    getCategoryByDbValue(product.category)?.label ||
    product.category ||
    "Elektronikk";

  const filledStars = Math.round(social.rating);
  const cartImage = validImages[0] || mainImage || "";

  return (
    <Link href={`/products/${product.slug}`} className="group block h-full">
      <article className="ehx-card-lift relative flex h-full flex-col overflow-hidden rounded-[1rem] border border-[var(--border)] bg-white shadow-[var(--ehx-shadow-sm)]">
        {(hasDiscount || product.isNew) && (
          <div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1.5">
            {hasDiscount ? (
              <span className="rounded-md bg-[var(--danger)] px-2 py-1 text-[11px] font-bold leading-none text-white shadow-sm">
                -{discountPercent}%
              </span>
            ) : null}
            {product.isNew ? (
              <span className="rounded-md bg-[var(--navy)] px-2 py-1 text-[10px] font-bold leading-none text-white shadow-sm">
                NYHET
              </span>
            ) : null}
          </div>
        )}

        <div
          className="relative aspect-square overflow-hidden"
          style={{ background: "var(--ehx-image-bg)" }}
        >
          <ProductCardMedia mainImage={mainImage} alt={cleanedName} />
        </div>

        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            {categoryLabel}
          </p>

          <h3 className="mt-1 line-clamp-2 min-h-[2.4rem] text-[0.8125rem] font-semibold leading-snug text-[var(--text-secondary)] transition-colors group-hover:text-[var(--brand-dark)] sm:text-sm">
            {cleanedName}
          </h3>

          <div className="mt-auto pt-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[1.35rem] font-bold tracking-tight text-[var(--text)] sm:text-[1.5rem]">
                {Math.floor(product.price).toLocaleString("no-NO")},-
              </span>
              {hasDiscount && compareAtPrice !== null ? (
                <span className="text-xs text-slate-400 line-through sm:text-[13px]">
                  {Math.floor(compareAtPrice).toLocaleString("no-NO")},-
                </span>
              ) : null}
            </div>

            {showRating ? (
              <div
                className="mt-1 flex items-center gap-1"
                aria-label={`${social.rating.toFixed(1)} av 5 stjerner, ${social.reviews} anmeldelser`}
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i < filledStars
                        ? "fill-amber-400 text-amber-400"
                        : "fill-slate-200 text-slate-200"
                    }`}
                    strokeWidth={0}
                  />
                ))}
                <span className="ml-0.5 text-[11px] text-[var(--text-muted)]">
                  ({social.reviews})
                </span>
              </div>
            ) : null}

            {availability.purchasable ? (
              <p className="mt-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand)] align-middle" />
                {availability.label}
                <span className="text-[var(--text-muted)]">
                  {" "}
                  · {SITE_CONFIG.deliveryPromise.replace(/^Levering\s+/i, "")}
                </span>
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] font-medium text-red-500">
                {availability.label}
              </p>
            )}

            <ProductCardQuickAdd
              productId={product.id}
              name={cleanedName}
              price={product.price}
              image={cartImage}
              slug={product.slug}
              category={product.category || undefined}
              purchasable={availability.purchasable}
              unavailableLabel={availability.label}
            />
          </div>
        </div>
      </article>
    </Link>
  );
}

export default ProductCard;
export { ProductCard };
