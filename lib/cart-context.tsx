"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  slug?: string;
  variantId?: string;
  variantName?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_KEY = "dropshipping-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CART_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addToCart = (item: CartItem, quantity = 1) => {
    setItems((prev) => {
      // For products with variants, check both productId and variantId
      const existing = prev.find(
        (cartItem) =>
          cartItem.productId === item.productId &&
          cartItem.variantId === item.variantId
      );
      if (existing) {
        return prev.map((cartItem) =>
          cartItem.productId === item.productId &&
          cartItem.variantId === item.variantId
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      }
      return [...prev, { ...item, quantity }];
    });
  };

  const removeFromCart = (key: string) => {
    // Key format: "productId" or "productId-variantId"
    const [productId, variantId] = key.split("-");
    setItems((prev) =>
      prev.filter(
        (item) =>
          !(
            item.productId === productId &&
            (variantId ? item.variantId === variantId : !item.variantId)
          )
      )
    );
  };

  const updateQuantity = (key: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(key);
      return;
    }

    // Key format: "productId" or "productId-variantId"
    const [productId, variantId] = key.split("-");
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId &&
        (variantId ? item.variantId === variantId : !item.variantId)
          ? { ...item, quantity }
          : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const { total, itemCount } = useMemo(() => {
    return {
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [items]);

  const value: CartContextType = {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    total,
    itemCount,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    // Return a default no-op implementation instead of throwing
    // This allows components to render during SSR or if CartProvider is not available
    return {
      items: [],
      addToCart: () => {
        if (typeof window !== "undefined") {
          console.warn("CartProvider not available - cannot add to cart");
        }
      },
      removeFromCart: () => {},
      updateQuantity: () => {},
      clearCart: () => {},
      total: 0,
      itemCount: 0,
    };
  }
  return context;
}

