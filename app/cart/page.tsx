"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-context";

export default function CartPage() {
  const { items, total, updateQuantity, removeFromCart } = useCart();
  const shippingCost = total >= 500 ? 0 : 99;
  const totalWithShipping = total + shippingCost;

  if (items.length === 0) {
    return (
      <div className="mx-auto min-h-screen max-w-7xl px-4 py-16 text-center">
        <ShoppingBag className="mx-auto mb-4 h-24 w-24 text-gray-300" />
        <h1 className="mb-2 text-2xl font-bold text-dark">Handlekurven er tom</h1>
        <p className="mb-6 text-gray-medium">
          Du har ingen produkter i handlekurven ennå.
        </p>
        <Link
          href="/products"
          className="inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold text-dark">Handlekurv</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Venstre - Produktliste */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white p-6">
            <div className="space-y-4">
              {items.map((item) => {
                const itemKey = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                return (
                  <div
                    key={itemKey}
                    className="flex gap-4 border-b border-gray-border pb-4 last:border-0"
                  >
                    {/* Produktbilde */}
                    <Link href={`/products/${item.slug || item.productId}`} className="relative h-24 w-24 flex-shrink-0">
                      <Image
                        src={item.image || 'https://placehold.co/100x100'}
                        alt={item.name}
                        fill
                        className="rounded-lg object-contain"
                      />
                    </Link>

                    {/* Produktinfo */}
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <Link href={`/products/${item.slug || item.productId}`} className="font-semibold text-dark hover:text-brand transition-colors">
                          {item.name}
                        </Link>
                        {item.variantName && (
                          <p className="text-sm text-gray-medium">Variant: {item.variantName}</p>
                        )}
                        <p className="text-sm text-gray-medium">
                          {item.price.toLocaleString('no-NO')},-
                        </p>
                      </div>

                      {/* Antall og fjern */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center rounded-lg border border-gray-border">
                          <button
                            onClick={() => {
                              const key = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                              updateQuantity(key, item.quantity - 1);
                            }}
                            className="px-3 py-2 hover:bg-gray-light transition-colors"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-12 text-center font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => {
                              const key = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                              updateQuantity(key, item.quantity + 1);
                            }}
                            className="px-3 py-2 hover:bg-gray-light transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            const key = `${item.productId}${item.variantId ? `-${item.variantId}` : ""}`;
                            removeFromCart(key);
                          }}
                          className="text-gray-medium hover:text-sale transition-colors"
                          aria-label="Fjern produkt"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Subtotal */}
                    <div className="text-right">
                      <p className="font-bold text-dark">
                        {(item.price * item.quantity).toLocaleString('no-NO')},-
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Høyre - Sammendrag */}
        <div>
          <div className="sticky top-24 rounded-xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-dark">Sammendrag</h2>

            <div className="space-y-3 border-b border-gray-border pb-4">
              <div className="flex justify-between text-gray-medium">
                <span>Subtotal</span>
                <span>{total.toLocaleString('no-NO')},-</span>
              </div>
              <div className="flex justify-between text-gray-medium">
                <span>Frakt</span>
                <span className={shippingCost === 0 ? 'text-brand font-semibold' : ''}>
                  {shippingCost === 0 ? 'Gratis!' : `${shippingCost},-`}
                </span>
              </div>
              {total < 500 && (
                <p className="text-xs text-brand">
                  ✨ Kjøp for {(500 - total).toLocaleString('no-NO')},- mer og få gratis frakt!
                </p>
              )}
            </div>

            <div className="mt-4 flex justify-between text-xl font-bold text-dark">
              <span>Total</span>
              <span>{totalWithShipping.toLocaleString('no-NO')},-</span>
            </div>

            <Link
              href="/checkout"
              className="mt-6 block w-full rounded-lg bg-brand py-4 text-center font-semibold text-white hover:bg-brand-dark transition-colors"
            >
              Gå til kassen
            </Link>

            <Link
              href="/products"
              className="mt-3 block text-center text-sm text-brand hover:underline"
            >
              ← Fortsett å handle
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

