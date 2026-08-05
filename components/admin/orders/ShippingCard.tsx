import { OrderCard } from "./order-ui";

type Props = {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  method?: string | null;
  eta?: string | null;
  supplierOrderId?: string | null;
  onSync?: () => void;
  syncing?: boolean;
};

export function ShippingCard({
  carrier,
  trackingNumber,
  trackingUrl,
  method,
  eta,
  supplierOrderId,
  onSync,
  syncing,
}: Props) {
  return (
    <OrderCard title="Frakt & Sporing">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-500">Leverandør</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {carrier || "CJ Dropshipping"}
          </dd>
        </div>
        {supplierOrderId && (
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Leverandørordre
            </dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-700">
              {supplierOrderId}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium text-slate-500">Trackingnummer</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {trackingNumber || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Fraktmetode</dt>
          <dd className="mt-0.5 text-slate-800">{method || "Standard"}</dd>
        </div>
        {eta && (
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Estimert levering
            </dt>
            <dd className="mt-0.5 text-slate-800">{eta}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        {trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Spor pakke
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
          >
            Spor pakke
          </button>
        )}
        {onSync && (
          <button
            type="button"
            disabled={syncing}
            onClick={onSync}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncing ? "Synkroniserer…" : "Synkroniser status"}
          </button>
        )}
      </div>
    </OrderCard>
  );
}
