"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

type Stats = {
  imported: number;
  published: number;
  failedImports: number;
  outOfStock: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncPriceChanges: number;
  nextSyncAt: string | null;
  queue: Record<string, number>;
};

export default function SupplierSyncClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/suppliers/sync");
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Kunne ikke hente sync");
      setStats(data.stats);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSync = async (mode: "inventory" | "price" | "both") => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/suppliers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, mode }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Sync feilet");
      toast.success("Sync fullført");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync feilet");
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex justify-center py-16 text-gray-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const cards = [
    { label: "Importert", value: stats?.imported ?? 0 },
    { label: "Publisert", value: stats?.published ?? 0 },
    { label: "Feilet import", value: stats?.failedImports ?? 0 },
    { label: "Utsolgt", value: stats?.outOfStock ?? 0 },
    { label: "Prisendringer (siste sync)", value: stats?.lastSyncPriceChanges ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-gray-500">{c.label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm text-sm text-gray-700 space-y-1">
        <div>
          Siste synkronisering:{" "}
          {stats?.lastSyncAt
            ? new Date(stats.lastSyncAt).toLocaleString("no-NO")
            : "—"}{" "}
          ({stats?.lastSyncStatus || "ingen"})
        </div>
        <div>
          Neste planlagte:{" "}
          {stats?.nextSyncAt
            ? new Date(stats.nextSyncAt).toLocaleString("no-NO")
            : "hver 6. time (cron)"}
        </div>
        <div>
          Kø:{" "}
          {Object.entries(stats?.queue || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(", ") || "tom"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runSync("both")}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {syncing ? "Synker…" : "Kjør full sync"}
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runSync("inventory")}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          Kun lager
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runSync("price")}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          Kun pris
        </button>
      </div>
    </div>
  );
}
