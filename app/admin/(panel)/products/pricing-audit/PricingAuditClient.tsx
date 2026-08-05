"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, RefreshCw, Check, X } from "lucide-react";
import type { PricingAuditItem, PricingAuditQueue } from "@/lib/ops/catalog-pricing-audit";

export default function PricingAuditClient() {
  const [queue, setQueue] = useState<PricingAuditQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products/pricing-audit");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Kunne ikke hente");
      setQueue(data.queue);
      setSelected(new Set());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingItems = useMemo(
    () => (queue?.items || []).filter((i) => i.status === "pending"),
    [queue]
  );
  const flaggedItems = useMemo(
    () => (queue?.items || []).filter((i) => i.status === "flagged"),
    [queue]
  );

  const runAudit = async () => {
    if (
      !confirm(
        "Kjøre katalogpris-audit for alle importerte produkter?\n\nResultat legges i godkjenningskø — ingen priser publiseres automatisk."
      )
    ) {
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/admin/products/pricing-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Audit feilet");
      setQueue(data.queue);
      setSelected(new Set());
      toast.success(data.message || "Audit ferdig");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Audit feilet");
    } finally {
      setRunning(false);
    }
  };

  const approve = async (productIds?: string[], approveAllPending?: boolean) => {
    const count = approveAllPending ? pendingItems.length : productIds?.length || 0;
    if (count === 0) {
      toast.error("Ingen ventende forslag");
      return;
    }
    if (
      !confirm(
        `Publisere ${count} prisendring(er)?\n\nDette oppdaterer live leverandørkost + salgspris.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/products/pricing-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          productIds,
          approveAllPending,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Godkjenning feilet");
      toast.success(data.message);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const reject = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/products/pricing-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", productIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Avvisning feilet");
      toast.success(data.message);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPending = () => {
    setSelected(new Set(pendingItems.map((i) => i.productId)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/products" className="text-sm text-gray-500 hover:text-gray-800">
            ← Produkter
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            Priskontroll
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Henter Temu-sidepris fra URL, erstatter falsk ~105 NOK-leverandørkost (9.99 USD-fallback),
            og foreslår realistiske norske salgspriser. Ingenting går live før godkjenning.
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() => void runAudit()}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Kjør audit
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-gray-200 bg-white">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      ) : !queue ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          Ingen revisjonskø ennå. Kjør audit for å generere rapport.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Stat label="Skannet" value={queue.summary.scanned} />
            <Stat label="Endringer i kø" value={queue.summary.changes} hot />
            <Stat label="Uendret" value={queue.summary.unchanged} />
            <Stat label="~105-fallback" value={queue.summary.fallback105 ?? 0} warn />
            <Stat label="Mangler kost" value={queue.summary.missingCost} warn />
            <Stat label="Venter" value={queue.summary.pending} hot />
          </div>
          <p className="text-xs text-gray-500">
            Generert {new Date(queue.generatedAt).toLocaleString("no-NO")} · status:{" "}
            {queue.status}
          </p>

          {pendingItems.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={selectAllPending}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                Velg alle ventende
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void approve(Array.from(selected))}
                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Check size={14} />
                Godkjenn valgte ({selected.size})
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void reject(Array.from(selected))}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <X size={14} />
                Avvis valgte
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void approve(undefined, true)}
                className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                Godkjenn alle ventende
              </button>
            </div>
          )}

          <ReportTable
            title="Foreslåtte endringer (godkjenningskø)"
            items={pendingItems}
            selectable
            selected={selected}
            onToggle={toggle}
            empty="Ingen ventende prisendringer."
          />

          <ReportTable
            title="Mangler leverandørkost (flagget)"
            items={flaggedItems}
            selectable={false}
            selected={selected}
            onToggle={toggle}
            empty="Ingen produkter uten kost."
          />

          <ReportTable
            title="Øvrige (godkjent / avvist)"
            items={(queue.items || []).filter(
              (i) => i.status === "approved" || i.status === "rejected"
            )}
            selectable={false}
            selected={selected}
            onToggle={toggle}
            empty="Ingen behandlede rader ennå."
          />
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hot,
  warn,
}: {
  label: string;
  value: number;
  hot?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm ${
        warn
          ? "border-amber-200"
          : hot
            ? "border-green-200"
            : "border-gray-200"
      }`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          warn ? "text-amber-800" : hot ? "text-green-800" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function nok(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}`;
}

function ReportTable({
  title,
  items,
  selectable,
  selected,
  onToggle,
  empty,
}: {
  title: string;
  items: PricingAuditItem[];
  selectable: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {title}{" "}
          <span className="font-normal text-gray-500">({items.length})</span>
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                {selectable && <th className="px-3 py-2" />}
                <th className="px-3 py-2">Produkt</th>
                <th className="px-3 py-2">Temu</th>
                <th className="px-3 py-2">Leverandør nå / foreslått</th>
                <th className="px-3 py-2">Salg nå / foreslått</th>
                <th className="px-3 py-2">Margin</th>
                <th className="px-3 py-2">Frakt / landed</th>
                <th className="px-3 py-2">Årsak</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productId} className="border-t border-gray-100 align-top">
                  {selectable && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.productId)}
                        onChange={() => onToggle(item.productId)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/edit/${item.productId}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <div className="text-xs text-gray-500">{item.slug}</div>
                    {item.usedFallback105 && (
                      <div className="mt-0.5 text-xs font-medium text-amber-700">
                        9.99 USD→~105 fallback
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {nok(item.temuPagePrice)}
                    {item.temuPriceSource && (
                      <div className="text-[10px] text-gray-400">{item.temuPriceSource}</div>
                    )}
                    {item.shippingEstimate && (
                      <div className="mt-0.5 max-w-[120px] truncate text-[10px] text-gray-500">
                        {item.shippingEstimate}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <span className={item.usedFallback105 ? "text-amber-700 line-through" : ""}>
                      {nok(item.currentSupplierPrice)}
                    </span>
                    {" → "}
                    <span className="font-semibold text-green-800">
                      {nok(item.suggestedSupplierPrice)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {nok(item.currentSalePrice)}
                    {" → "}
                    <span className="font-semibold text-green-800">
                      {nok(item.suggestedSalePrice)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {item.expectedMarginPct != null ? `${item.expectedMarginPct} %` : "—"}
                    {item.markupPct != null && (
                      <div className="text-xs text-gray-500">påslag {item.markupPct} %</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {item.missingSupplierCost ? (
                      <span className="font-medium text-amber-800">Mangler kost</span>
                    ) : (
                      <>
                        <div>Innfrakt {nok(item.inboundShipping)}</div>
                        <div>Landed {nok(item.landedCost)}</div>
                      </>
                    )}
                  </td>
                  <td className="max-w-xs px-3 py-2 text-xs text-gray-600">{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
