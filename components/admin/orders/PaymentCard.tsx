import { OrderCard, StatusBadge, paymentBadge } from "./order-ui";
import { humanPaymentMethod } from "@/lib/order-labels";

type Props = {
  orderId: string;
  orderNumber: string;
  createdAtLabel: string;
  channel?: string;
  paymentMethod?: string | null;
  paymentStatus: string;
  ipAddress?: string | null;
  notes?: string | null;
};

export function PaymentCard({
  orderId,
  orderNumber,
  createdAtLabel,
  channel = "Nettbutikk",
  paymentMethod,
  paymentStatus,
  ipAddress,
  notes,
}: Props) {
  const pay = paymentBadge(paymentStatus);
  return (
    <OrderCard title="Ordredetaljer">
      <dl className="space-y-3 text-sm">
        <Row label="Ordre-ID" value={orderNumber} mono />
        <Row label="Intern ID" value={orderId.slice(0, 12) + "…"} mono muted />
        <Row label="Ordredato" value={createdAtLabel} />
        <Row label="Kanal" value={channel} />
        <Row
          label="Betalingsmetode"
          value={humanPaymentMethod(paymentMethod) || "—"}
        />
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Betalingsstatus</dt>
          <dd>
            <StatusBadge tone={pay.tone}>{pay.label}</StatusBadge>
          </dd>
        </div>
        {ipAddress ? <Row label="IP-adresse" value={ipAddress} mono muted /> : null}
        {notes ? (
          <div>
            <dt className="text-xs font-medium text-slate-500">Notater</dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-800">
              {notes}
            </dd>
          </div>
        ) : null}
      </dl>
    </OrderCard>
  );
}

function Row({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd
        className={`text-right font-medium ${
          muted ? "text-slate-500" : "text-slate-900"
        } ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
