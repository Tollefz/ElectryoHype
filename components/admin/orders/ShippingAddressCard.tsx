import { OrderCard } from "./order-ui";

type Address = {
  name?: string;
  address?: string;
  address2?: string;
  zip?: string;
  city?: string;
  country?: string;
};

type Props = {
  address: Address;
  onEditHint?: string;
};

export function ShippingAddressCard({ address, onEditHint }: Props) {
  return (
    <OrderCard
      title="Leveringsadresse"
      action={
        <span className="text-xs font-medium text-slate-400" title={onEditHint}>
          Rediger
        </span>
      }
    >
      <div className="space-y-1 text-sm text-slate-800">
        <p className="font-semibold text-slate-900">{address.name || "—"}</p>
        <p>{address.address || "—"}</p>
        {address.address2 ? <p>{address.address2}</p> : null}
        <p>
          {[address.zip, address.city].filter(Boolean).join(" ") || "—"}
        </p>
        {address.country ? (
          <p className="text-slate-500">{address.country}</p>
        ) : null}
      </div>
    </OrderCard>
  );
}
