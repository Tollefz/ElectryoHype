"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import toast from "react-hot-toast";

type ProductCardQuickAddProps = {
  productId: string;
  name: string;
  price: number;
  image: string;
  slug: string;
  category?: string;
  purchasable: boolean;
  unavailableLabel: string;
};

export function ProductCardQuickAdd({
  productId,
  name,
  price,
  image,
  slug,
  category,
  purchasable,
  unavailableLabel,
}: ProductCardQuickAddProps) {
  const { addToCart } = useCart();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!purchasable) return;

    addToCart(
      {
        productId,
        name,
        price,
        image,
        quantity: 1,
        slug,
        variantId: undefined,
        variantName: undefined,
        category,
      },
      1
    );
    toast.success(`${name} lagt i handlekurv`);
  };

  return (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={!purchasable}
      className={`ehx-btn ehx-btn-primary mt-2.5 w-full py-2.5 text-sm ${
        !purchasable ? "!cursor-not-allowed !bg-slate-300 !shadow-none" : ""
      }`}
    >
      <ShoppingCart size={14} />
      <span>{purchasable ? "Legg i handlekurv" : unavailableLabel}</span>
    </button>
  );
}
