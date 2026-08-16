'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  RotateCcw,
  Check,
  Shield,
  CreditCard,
  Headphones,
  ShoppingCart,
} from 'lucide-react';
import ProductPageClientWrapper, {
  useProductVariant,
} from '@/components/ProductPageClientWrapper';
import ProductVariantSelector from '@/components/ProductVariantSelector';
import AddToCartButton from '@/components/AddToCartButton';
import ProductPrice from '@/components/ProductPrice';
import ProductCard from '@/components/ProductCard';
import ProductTabs from '@/components/ProductTabs';
import ProductMediaGallery from '@/components/products/ProductMediaGallery';
import { getAvailabilityBadgeClasses } from '@/lib/products/availability';
import type { ProductPresentation } from '@/lib/products/presentation';
import { useCart } from '@/lib/cart-context';
import toast from 'react-hot-toast';

function getTrustIcon(id: string) {
  switch (id) {
    case 'free_shipping':
      return Truck;
    case 'open_purchase':
      return RotateCcw;
    case 'warranty':
      return Shield;
    case 'secure_payment':
      return CreditCard;
    case 'support':
      return Headphones;
    default:
      return Check;
  }
}

function MobileStickyBuy({
  presentation,
}: {
  presentation: ProductPresentation;
}) {
  const [visible, setVisible] = useState(false);
  const { addToCart } = useCart();
  const variantCtx = useProductVariant();
  const selected = variantCtx?.selectedVariant;
  const price = selected?.price ?? presentation.price;
  const purchasable = presentation.availability.purchasable;

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!purchasable || !visible) return null;

  const handleAdd = () => {
    addToCart(
      {
        productId: presentation.cartProduct.id,
        name: presentation.cartProduct.name,
        price,
        image: selected?.image || presentation.cartProduct.image || '',
        quantity: 1,
        slug: presentation.cartProduct.slug,
        variantId: selected?.id,
        variantName: selected?.name,
        category: presentation.category,
      },
      1
    );
    toast.success('Lagt i handlekurv');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-[var(--text-muted)]">
            {presentation.title}
          </p>
          <p className="text-lg font-bold tabular-nums text-[var(--text)]">
            {Math.floor(price).toLocaleString('no-NO')},-
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="ehx-btn ehx-btn-primary shrink-0 px-5 py-3 text-sm"
        >
          <ShoppingCart size={16} />
          Legg i handlekurv
        </button>
      </div>
    </div>
  );
}

/**
 * Global ElectroHypeX product template.
 * All products — regardless of supplier — render through this component.
 */
export default function ProductStorefront({
  presentation: p,
}: {
  presentation: ProductPresentation;
}) {
  const variantsForUi = p.variants.map((v) => ({
    id: v.id,
    name: v.name,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    image: v.image,
    attributes: v.attributes,
    stock: v.stock,
    slug: v.slug,
    colorCode: v.colorCode,
  }));

  return (
    <main className="ehx-page-bg min-h-screen pb-24 lg:pb-0">
      <div className="ehx-container py-5 sm:py-7 lg:py-8">
        <nav
          className="mb-5 flex items-center gap-1.5 overflow-x-auto text-xs text-[var(--text-secondary)] sm:mb-6 sm:gap-2 sm:text-sm"
          aria-label="Brødsmulesti"
        >
          {p.breadcrumbs.map((crumb, i) => (
            <span key={`${crumb.href}-${i}`} className="flex items-center gap-1.5 sm:gap-2">
              {i > 0 ? <span className="text-[var(--text-muted)]">/</span> : null}
              {i < p.breadcrumbs.length - 1 ? (
                <Link
                  href={crumb.href}
                  className="whitespace-nowrap transition-colors hover:text-[var(--brand-dark)]"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span className="truncate text-[var(--text)]">{crumb.name}</span>
              )}
            </span>
          ))}
        </nav>

        <ProductPageClientWrapper
          images={p.media.images}
          productName={p.title}
          variants={variantsForUi}
          defaultImage={p.defaultImage}
          activeVariantSlug={p.activeVariantSlug}
          videoCount={p.media.videos.length}
          galleryExtra={
            <ProductMediaGallery videos={p.media.videos} productName={p.title} />
          }
          belowGallery={
            <ProductTabs
              description={p.descriptionHtml}
              specifications={p.specs}
            />
          }
          stickyBuy={<MobileStickyBuy presentation={p} />}
        >
          <div className="rounded-[1rem] border border-[var(--border)] bg-white p-5 shadow-[var(--ehx-shadow-sm)] sm:p-6 lg:p-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {p.hasDiscount ? (
                <span className="rounded-md bg-[var(--danger)] px-2.5 py-1 text-xs font-bold text-white">
                  SPAR {p.discountPercent}%
                </span>
              ) : null}
              <span className={getAvailabilityBadgeClasses(p.availability)}>
                {p.availability.purchasable
                  ? `${p.availability.label} · 5–12 virkedager`
                  : p.availability.label}
              </span>
            </div>

            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
              {p.category}
            </p>

            <h1 className="mb-4 text-xl font-bold tracking-tight text-[var(--text)] sm:mb-5 sm:text-2xl lg:text-[1.65rem] lg:leading-snug">
              {p.title}
            </h1>

            <div className="mb-5 border-b border-[var(--border)] pb-5">
              <ProductPrice
                basePrice={p.price}
                baseCompareAt={p.compareAtPrice}
              />
            </div>

            {p.shortIntro ? (
              <p className="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                {p.shortIntro}
              </p>
            ) : null}

            {p.variants.length > 0 ? (
              <div className="mb-5">
                <Suspense
                  fallback={
                    <div className="h-16 w-full animate-pulse rounded-[var(--ehx-radius-md)] bg-[var(--ehx-image-bg)]" />
                  }
                >
                  <ProductVariantSelector
                    variants={variantsForUi}
                    defaultImage={p.defaultImage}
                    productName={p.title}
                    variantTypeLabel={p.variantTypeLabel}
                  />
                </Suspense>
              </div>
            ) : null}

            {p.availability.purchasable ? (
              <AddToCartButton product={p.cartProduct} variants={variantsForUi} />
            ) : (
              <div className="rounded-[var(--ehx-radius-md)] border border-red-200 bg-red-50 p-4 text-center">
                <p className="mb-1 text-sm font-semibold text-red-700">
                  Ikke tilgjengelig for kjøp
                </p>
                <p className="text-xs text-red-600">
                  Dette produktet er for øyeblikket ikke på lager.
                </p>
              </div>
            )}

            <ul className="mt-5 grid grid-cols-1 gap-2 sm:mt-6 sm:grid-cols-2">
              {p.trustBadges.map((badge) => {
                const Icon = getTrustIcon(badge.id);
                return (
                  <li
                    key={badge.id}
                    className="flex items-start gap-2.5 rounded-[0.75rem] border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-2.5"
                  >
                    <Icon
                      className="mt-0.5 shrink-0 text-[var(--brand-dark)]"
                      size={17}
                      strokeWidth={1.75}
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="text-xs font-semibold text-[var(--text)]">
                        ✓ {badge.title}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {badge.subtitle}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </ProductPageClientWrapper>

        {p.related.length > 0 ? (
          <section className="ehx-section !pb-0 !pt-10 sm:!pt-12">
            <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
              <h2 className="ehx-heading-2">Lignende produkter</h2>
              {p.categoryHref ? (
                <Link
                  href={p.categoryHref}
                  className="hidden text-sm font-semibold text-[var(--brand-dark)] hover:underline sm:inline"
                >
                  Se mer i {p.category} →
                </Link>
              ) : null}
            </div>
            <div className="ehx-product-grid !grid-cols-2 md:!grid-cols-3 lg:!grid-cols-4 xl:!grid-cols-4">
              {p.related.map((item) => (
                <ProductCard
                  key={item.id}
                  product={{
                    id: item.id,
                    name: item.name,
                    slug: item.slug,
                    price: item.price,
                    compareAtPrice: item.compareAtPrice,
                    images: item.images,
                    category: item.category,
                  }}
                  showRating={false}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
