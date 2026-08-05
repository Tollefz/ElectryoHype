import Link from "next/link";
import { OrderCard } from "./order-ui";

type Props = {
  name: string | null;
  email: string | null;
  phone: string | null;
  customerId?: string | null;
  orderCountHint?: string | null;
};

export function CustomerCard({
  name,
  email,
  phone,
  customerId,
  orderCountHint,
}: Props) {
  return (
    <OrderCard title="Kunde">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-500">Navn</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{name || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">E-post</dt>
          <dd className="mt-0.5 text-slate-800">{email || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Telefon</dt>
          <dd className="mt-0.5 text-slate-800">{phone || "—"}</dd>
        </div>
        {orderCountHint && (
          <p className="text-xs text-slate-500">{orderCountHint}</p>
        )}
      </dl>
      {customerId ? (
        <Link
          href={`/admin/customers/${customerId}`}
          className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Vis kundeprofil
        </Link>
      ) : (
        <span className="mt-4 inline-flex rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-400">
          Ingen kundeprofil
        </span>
      )}
    </OrderCard>
  );
}
