"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus, ShoppingBag, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";

export default function CartPage() {
  const { items, total, updateQuantity, removeFromCart } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const shippingCost = total >= 500 ? 0 : 99;
  const totalWithShipping = total + shippingCost;

  if (items.length === 0) {
    return (
      <div className="mx-auto min-h-screen max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
        <ShoppingBag className="mx-auto mb-4 h-16 w-16 sm:h-24 sm:w-24 text-gray-300" />
        <h1 className="mb-2 text-xl sm:text-2xl font-bold text-gray-900">Handlekurven er tom</h1>
        <p className="mb-6 text-sm sm:text-base text-gray-600">
          Du har ingen produkter i handlekurven ennå.
        </p>
        <Link
          href="/products"
          className="inline-block rounded-lg bg-green-600 px-6 py-3 text-sm sm:text-base font-semibold text-white hover:bg-green-700 transition-colors"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      <h1 className="mb-4 sm:mb-6 text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Handlekurv</h1>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[2fr,1fr]">
        {/* Venstre - Produktliste */}
        <div>
          <div className="rounded-lg bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
            <div className="space-y-3 sm:space-y-4">
              {items.map((item) => {
                const itemKey = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                return (
                  <div
                    key={itemKey}
                    className="flex gap-3 sm:gap-4 border-b border-gray-200 pb-3 sm:pb-4 last:border-0"
                  >
                    {/* Produktbilde */}
                    <Link href={`/products/${item.slug || item.productId}`} className="relative h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50">
                      <Image
                        src={item.image || 'https://placehold.co/100x100'}
                        alt={item.name}
                        fill
                        className="object-contain"
                      />
                    </Link>

                    {/* Produktinfo */}
                    <div className="flex flex-1 flex-col justify-between min-w-0">
                      <div className="min-w-0">
                        <Link href={`/products/${item.slug || item.productId}`} className="block text-sm sm:text-base font-semibold text-gray-900 hover:text-green-600 transition-colors line-clamp-2">
                          {item.name}
                        </Link>
                        {item.variantName && (
                          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Variant: {item.variantName}</p>
                        )}
                        <p className="text-sm sm:text-base font-semibold text-gray-900 mt-1">
                          {item.price.toLocaleString('no-NO')},-
                        </p>
                      </div>

                      {/* Antall og fjern */}
                      <div className="flex items-center justify-between mt-2 sm:mt-3">
                        <div className="flex items-center rounded-lg border border-gray-300">
                          <button
                            onClick={() => {
                              const key = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                              updateQuantity(key, item.quantity - 1);
                            }}
                            className="px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-gray-50 transition-colors"
                            aria-label="Reduser antall"
                          >
                            <Minus size={14} className="sm:w-4 sm:h-4" />
                          </button>
                          <span className="w-8 sm:w-12 text-center text-sm sm:text-base font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => {
                              const key = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                              updateQuantity(key, item.quantity + 1);
                            }}
                            className="px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-gray-50 transition-colors"
                            aria-label="Øk antall"
                          >
                            <Plus size={14} className="sm:w-4 sm:h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <p className="text-sm sm:text-base font-bold text-gray-900">
                            {(item.price * item.quantity).toLocaleString('no-NO')},-
                          </p>
                          <button
                            onClick={() => {
                              const key = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                              removeFromCart(key);
                            }}
                            className="text-gray-500 hover:text-red-600 transition-colors p-1"
                            aria-label="Fjern produkt"
                          >
                            <Trash2 size={18} className="sm:w-5 sm:h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Høyre - Sammendrag (Desktop) / Nederst (Mobil) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 rounded-lg sm:rounded-xl bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="mb-3 sm:mb-4 text-lg sm:text-xl font-bold text-gray-900">Sammendrag</h2>

            <div className="space-y-2 sm:space-y-3 border-b border-gray-200 pb-3 sm:pb-4">
              <div className="flex justify-between text-sm sm:text-base text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium">{total.toLocaleString('no-NO')},-</span>
              </div>
              <div className="flex justify-between text-sm sm:text-base text-gray-600">
                <span>Frakt</span>
                <span className={`font-medium ${shippingCost === 0 ? 'text-green-600' : ''}`}>
                  {shippingCost === 0 ? 'Gratis!' : `${shippingCost},-`}
                </span>
              </div>
              {total < 500 && (
                <p className="text-xs sm:text-sm text-green-600 mt-2">
                  ✨ Kjøp for {(500 - total).toLocaleString('no-NO')},- mer og få gratis frakt!
                </p>
              )}
            </div>

            <div className="mt-4 flex justify-between text-lg sm:text-xl font-bold text-gray-900">
              <span>Total</span>
              <span>{totalWithShipping.toLocaleString('no-NO')},-</span>
            </div>

            {checkoutError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {checkoutError}
              </div>
            )}
            <button
              onClick={async () => {
                setIsCheckingOut(true);
                setCheckoutError(null);
                try {
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
                    setCheckoutError(data.error || "Noe gikk galt med kassen. Prøv igjen senere.");
                    setIsCheckingOut(false);
                  }
                } catch (error) {
                  setCheckoutError("Noe gikk galt med kassen. Prøv igjen senere.");
                  setIsCheckingOut(false);
                }
              }}
              disabled={isCheckingOut}
              className="mt-4 sm:mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 sm:py-4 text-center text-sm sm:text-base font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingOut ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Behandler...</span>
                </>
              ) : (
                "Gå til kassen"
              )}
            </button>

            <Link
              href="/products"
              className="mt-3 block text-center text-xs sm:text-sm text-green-600 hover:text-green-700 hover:underline"
            >
              ← Fortsett å handle
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

