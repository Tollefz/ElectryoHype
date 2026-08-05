"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { OrderWorkerDeskStatus } from "@/lib/orders/order-worker";

const LIGHT: Record<
  OrderWorkerDeskStatus["status"],
  { label: string; className: string; dot: string }
> = {
  running: {
    label: "Kjører",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200",
    dot: "bg-emerald-500",
  },
  idle: {
    label: "Klar",
    className: "bg-slate-50 text-slate-800 border-slate-200",
    dot: "bg-slate-400",
  },
  stopped: {
    label: "Stoppet",
    className: "bg-rose-50 text-rose-900 border-rose-200",
    dot: "bg-rose-500",
  },
};

/**
 * Rob's Desk — Order Automation observation only (no processing logic).
 */
export function DeskOrderAutomation() {
  const [status, setStatus] = useState<OrderWorkerDeskStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders/automation?view=desk_status");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as OrderWorkerDeskStatus);
      }
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPoll({
    tick: load,
    active: Boolean(
      status?.status === "running" || (status?.counts?.queue ?? 0) > 0
    ),
    activeMs: 8_000,
    idleMs: 30_000,
    enabled: true,
  });

  const light = status ? LIGHT[status.status] : LIGHT.stopped;
  const c = status?.counts;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Order Automation
          </h2>
          <p className="text-sm text-slate-600">
            Jeg validerer, sender til CJ, henter tracking og varsler — du
            observerer.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${light.className}`}
        >
          <span className={`h-2 w-2 rounded-full ${light.dot}`} />
          {loading && !status ? "Laster…" : light.label}
        </span>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Henter status…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Metric label="I dag" value={c?.ordersToday ?? 0} />
            <Metric label="I kø" value={c?.queue ?? 0} />
            <Metric label="Validering" value={c?.validating ?? 0} />
            <Metric label="CJ" value={c?.cj ?? 0} />
            <Metric label="Tracking" value={c?.tracking ?? 0} />
            <Metric label="Retry" value={c?.retry ?? 0} />
            <Metric label="Feil" value={c?.errors ?? 0} emphasize={!!c?.errors} />
            <Metric label="Fullført i dag" value={c?.completedToday ?? 0} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              Siste tick:{" "}
              {status?.lastTickAt
                ? new Date(status.lastTickAt).toLocaleString("nb-NO")
                : "aldri"}
              {status?.lastBatch
                ? ` · batch ${status.lastBatch.advanced}/${status.lastBatch.claimed}`
                : ""}
            </p>
            <Link
              href="/admin/orders"
              className="font-medium text-emerald-700 hover:underline"
            >
              Åpne ordre →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        emphasize && value > 0
          ? "border-rose-200 bg-rose-50"
          : "border-slate-100 bg-slate-50/80"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          emphasize && value > 0 ? "text-rose-800" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
