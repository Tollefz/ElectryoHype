import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { OrderCard } from "./order-ui";

export type OrderProductLine = {
  name: string;
  image?: string | null;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  price: number;
  costNOK?: number | null;
  productUrl?: string | null;
};

type Props = {
  items: OrderProductLine[];
  /** When set, render totals under the product list (mockup style). */
  summary?: {
    subtotal: number;
    shippingCost: number;
    tax: number;
    discount?: number;
    total: number;
  };
};

export function OrderProductsCard({ items, summary }: Props) {
  return (
    <OrderCard title="Ordreprodukter">
      <ul className="divide-y divide-slate-100">
        {items.map((item, i) => {
          const qty = item.quantity || 1;
          const line = (item.price || 0) * qty;
          const margin =
            item.costNOK != null && item.price > 0
              ? Math.round(
                  ((item.price - item.costNOK) / item.price) * 100
                )
              : null;
          return (
            <li key={`${item.name}-${i}`} className="flex gap-3 py-4 first:pt-0">
              {item.image ? (
                <Image
                  src={item.image}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-xl border border-slate-100 object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                  —
                </div>
              )}
              <div className="min-w-0 flex-1">
                {item.productUrl ? (
                  <Link
                    href={item.productUrl}
                    className="font-semibold text-slate-900 hover:text-emerald-700"
                    target="_blank"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-900">{item.name}</p>
                )}
                <p className="mt-0.5 text-xs text-slate-500">
                  {[item.variantName, item.sku ? `SKU ${item.sku}` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {qty} × {formatCurrency(item.price)}
                  {item.costNOK != null
                    ? ` · Innkjøp ${formatCurrency(item.costNOK)}`
                    : ""}
                  {margin != null ? ` · Margin ${margin}%` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm font-semibold text-slate-900">
                {formatCurrency(line)}
              </div>
            </li>
          );
        })}
      </ul>

      {summary && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium text-slate-900">
              {formatCurrency(summary.subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Frakt</span>
            <span className="font-medium text-slate-900">
              {summary.shippingCost > 0
                ? formatCurrency(summary.shippingCost)
                : "Gratis"}
            </span>
          </div>
          {(summary.discount ?? 0) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Rabatt</span>
              <span className="font-medium text-slate-900">
                −{formatCurrency(summary.discount!)}
              </span>
            </div>
          )}
          {summary.tax > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>MVA</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(summary.tax)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
            <span>Total</span>
            <span>{formatCurrency(summary.total)}</span>
          </div>
        </div>
      )}
    </OrderCard>
  );
}
