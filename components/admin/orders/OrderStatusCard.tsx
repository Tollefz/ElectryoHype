import {
  OrderCard,
  ORDER_STATUS_STEPS,
  orderProgressIndex,
  StatusBadge,
  fulfillmentBadge,
} from "./order-ui";

type Props = {
  fulfillmentStatus: string;
  paymentStatus: string;
  onConfirm?: () => void;
  confirming?: boolean;
  moreActions?: React.ReactNode;
};

export function OrderStatusCard({
  fulfillmentStatus,
  paymentStatus,
  onConfirm,
  confirming,
  moreActions,
}: Props) {
  const active = orderProgressIndex(fulfillmentStatus, paymentStatus);
  const canConfirm = fulfillmentStatus === "NEW" && Boolean(onConfirm);
  const badge = fulfillmentBadge(fulfillmentStatus);

  return (
    <OrderCard
      title="Ordrestatus"
      action={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
    >
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-[520px] items-start justify-between gap-1">
          {ORDER_STATUS_STEPS.map((label, i) => {
            const done = i < active;
            const current = i === active;
            return (
              <li
                key={label}
                className="flex flex-1 flex-col items-center text-center"
              >
                <div className="flex w-full items-center">
                  {i > 0 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        i <= active ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : current
                          ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                          : "bg-slate-100 text-slate-400"
                    }`}
                    title={label}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  {i < ORDER_STATUS_STEPS.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        i < active ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`mt-2 max-w-[4.5rem] text-[10px] font-medium leading-tight ${
                    current ? "text-emerald-800" : "text-slate-500"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Aktivt steg:{" "}
        <span className="font-semibold text-slate-900">
          {ORDER_STATUS_STEPS[active]}
        </span>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canConfirm && (
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Bekreft ordre
          </button>
        )}
        {moreActions}
      </div>
    </OrderCard>
  );
}
