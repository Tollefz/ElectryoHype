import { OrderCard } from "./order-ui";
import { formatCurrency } from "@/lib/format";

type Props = {
  subtotal: number;
  shippingCost: number;
  tax: number;
  discount?: number;
  total: number;
};

export function OrderSummaryCard({
  subtotal,
  shippingCost,
  tax,
  discount = 0,
  total,
}: Props) {
  return (
    <OrderCard title="Ordresammendrag">
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span className="font-medium text-slate-900">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Frakt</span>
          <span className="font-medium text-slate-900">
            {shippingCost > 0 ? formatCurrency(shippingCost) : "Gratis"}
          </span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>Rabatt</span>
            <span className="font-medium text-slate-900">
              −{formatCurrency(discount)}
            </span>
          </div>
        )}
        {tax > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>MVA</span>
            <span className="font-medium text-slate-900">
              {formatCurrency(tax)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </OrderCard>
  );
}
