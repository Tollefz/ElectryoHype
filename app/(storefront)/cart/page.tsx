"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus, ShoppingBag, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { SITE_CONFIG } from "@/lib/site";
import {
  cartItemToAnalyticsItem,
  itemsValue,
  trackEcommerce,
} from "@/lib/analytics/ecommerce";

export default function CartPage() {
  const { items, total, updateQuantity, removeFromCart } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const shippingCost = total >= SITE_CONFIG.freeShippingThreshold ? 0 : 99;
  const totalWithShipping = total + shippingCost;

  if (items.length === 0) {
    return (
      <div className="ehx-page-bg min-h-screen">
        <div className="ehx-container py-16 text-center sm:py-20">
          <ShoppingBag className="mx-auto mb-5 h-14 w-14 text-[var(--text-muted)] sm:h-16 sm:w-16" />
          <h1 className="ehx-heading-2 mb-2">Handlekurven er tom</h1>
          <p className="ehx-body mb-8">
            Du har ingen produkter i handlekurven ennå.
          </p>
          <Link href="/products" className="ehx-btn ehx-btn-primary px-7 py-3.5">
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ehx-page-bg min-h-screen">
      <div className="ehx-container py-8 sm:py-10 lg:py-12">
        <h1 className="ehx-heading-2 mb-8 sm:mb-10">Handlekurv</h1>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:gap-10">
          <div className="rounded-[var(--ehx-radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--ehx-shadow-sm)] sm:p-6 lg:p-8">
            <div className="space-y-5">
              {items.map((item) => {
                const itemKey = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                return (
                  <div
                    key={itemKey}
                    className="flex gap-4 border-b border-[var(--border)] pb-5 last:border-0 last:pb-0"
                  >
                    <Link
                      href={`/products/${item.slug || item.productId}`}
                      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--ehx-radius-md)] sm:h-28 sm:w-28"
                      style={{ background: "var(--ehx-image-bg)" }}
                    >
                      <Image
                        src={item.image || "https://placehold.co/100x100"}
                        alt={item.name}
                        fill
                        className="object-contain p-2"
                      />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.slug || item.productId}`}
                          className="block text-sm font-semibold text-[var(--text)] transition hover:text-[var(--brand-dark)] line-clamp-2 sm:text-base"
                        >
                          {item.name}
                        </Link>
                        {item.variantName ? (
                          <p className="mt-0.5 text-xs text-[var(--text-muted)] sm:text-sm">
                            Variant: {item.variantName}
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-sm font-semibold text-[var(--text)] sm:text-base">
                          {item.price.toLocaleString("no-NO")},-
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center rounded-[var(--ehx-radius-sm)] border border-[var(--border-strong)]">
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                            className="px-2.5 py-2 transition hover:bg-[var(--surface-muted)]"
                            aria-label="Reduser antall"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-10 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                            className="px-2.5 py-2 transition hover:bg-[var(--surface-muted)]"
                            aria-label="Øk antall"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-[var(--text)] sm:text-base">
                            {(item.price * item.quantity).toLocaleString("no-NO")},-
                          </p>
                          <button
                            type="button"
                            onClick={() => removeFromCart(itemKey)}
                            className="p-1.5 text-[var(--text-muted)] transition hover:text-[var(--danger)]"
                            aria-label="Fjern produkt"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="rounded-[var(--ehx-radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--ehx-shadow-sm)] sm:p-6 lg:sticky lg:top-28">
              <h2 className="mb-4 text-lg font-bold tracking-tight text-[var(--text)]">
                Sammendrag
              </h2>

              <div className="space-y-3 border-b border-[var(--border)] pb-4">
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>Delsum</span>
                  <span className="font-medium text-[var(--text)]">
                    {total.toLocaleString("no-NO")},-
                  </span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>Frakt</span>
                  <span
                    className={`font-medium ${
                      shippingCost === 0
                        ? "text-[var(--brand-dark)]"
                        : "text-[var(--text)]"
                    }`}
                  >
                    {shippingCost === 0 ? "Gratis" : `${shippingCost},-`}
                  </span>
                </div>
                {total < SITE_CONFIG.freeShippingThreshold ? (
                  <p className="text-xs text-[var(--brand-dark)]">
                    Handle for{" "}
                    {(SITE_CONFIG.freeShippingThreshold - total).toLocaleString(
                      "no-NO"
                    )}
                    ,- mer og få gratis frakt.
                  </p>
                ) : (
                  <p className="text-xs font-medium text-[var(--brand-dark)]">
                    Gratis frakt inkludert
                  </p>
                )}
              </div>

              <div className="mt-4 flex justify-between text-lg font-bold text-[var(--text)]">
                <span>Totalt</span>
                <span>{totalWithShipping.toLocaleString("no-NO")},-</span>
              </div>

              {checkoutError ? (
                <div className="mt-4 rounded-[var(--ehx-radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {checkoutError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={async () => {
                  setIsCheckingOut(true);
                  setCheckoutError(null);
                  try {
                    const analyticsItems = items.map((item, index) =>
                      cartItemToAnalyticsItem(
                        {
                          productId: item.productId,
                          name: item.name,
                          price: item.price,
                          quantity: item.quantity,
                          variantName: item.variantName,
                          category: item.category,
                        },
                        index
                      )
                    );
                    trackEcommerce("begin_checkout", {
                      currency: "NOK",
                      value: itemsValue(analyticsItems),
                      items: analyticsItems,
                    });

                    const response = await fetch("/api/checkout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        items: items.map((item) => ({
                          productId: item.productId,
                          name: item.name,
                          price: item.price,
                          quantity: item.quantity,
                          image: item.image,
                          variantId: item.variantId,
                          variantName: item.variantName,
                        })),
                      }),
                    });
                    const data = await response.json();
                    if (data.ok && data.url) {
                      window.location.href = data.url;
                    } else {
                      setCheckoutError(
                        data.error ||
                          "Noe gikk galt med kassen. Prøv igjen senere."
                      );
                      setIsCheckingOut(false);
                    }
                  } catch {
                    setCheckoutError(
                      "Noe gikk galt med kassen. Prøv igjen senere."
                    );
                    setIsCheckingOut(false);
                  }
                }}
                disabled={isCheckingOut}
                className="ehx-btn ehx-btn-primary mt-5 w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Behandler…</span>
                  </>
                ) : (
                  "Til kassen"
                )}
              </button>

              <Link
                href="/products"
                className="mt-4 block text-center text-sm font-medium text-[var(--brand-dark)] transition hover:underline"
              >
                ← Fortsett å handle
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
