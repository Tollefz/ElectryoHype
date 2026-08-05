"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

export function BulkMarkOrderedButton({ count }: { count: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (count <= 0) return null;

  const run = async () => {
    if (
      !confirm(
        `Markere alle ${count} betalte NY-ordrer som «bestilt hos leverandør»?\n\nDette endrer kun status i databasen. Ingen leverandør kontaktes, ingen e-post sendes, og ingen penger brukes.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_ordered" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feil");
      toast.success(data.message || `Oppdatert ${data.updated}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke oppdatere");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={run}
      className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
    >
      {loading ? "Jobber…" : `Marker alle ${count} betalte NY som bestilt`}
    </button>
  );
}

export function CleanTestOrdersButton({ count }: { count: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (count <= 0) return null;

  const run = async () => {
    if (
      !confirm(
        `Rydd ${count} åpenbare test-/utviklingsordrer?\n\n• Kun ubetalte/feilede/refunderte ELLER eksplisitt markerte testordre\n• Betalte produksjonsordrer slettes ALDRI\n• Handling logges\n\nDette kan ikke angres.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders/clean-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Opprydding feilet");
      toast.success(data.message || `Slettet ${data.deleted}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Opprydding feilet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={run}
      className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
    >
      {loading ? "Rydder…" : `Rydd ${count} testordre`}
    </button>
  );
}

export function RetryFailedEmailsHint({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="text-xs text-amber-800">
      {count} ordre har feilet e-post — åpne køen og bruk «Send på nytt» (bulk-retry kommer neste
      runde for å fjerne enda flere klikk).
    </p>
  );
}

/** Rebuild entire catalog categories via AI Category Engine. */
export function RebuildCategoriesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const run = async (force = false) => {
    if (
      !confirm(
        force
          ? "Bygg kategorier på nytt (tving alle):\n\nRe-analyserer ALLE aktive produkter, også manuelt korrigerte.\nDette kan ta flere minutter."
          : "Bygg kategorier på nytt:\n\nAI analyserer aktive produkter, fikser feilplasseringer og oppdaterer tellinger.\nManuelt korrigerte produkter beholdes."
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Rebuild feilet");
      toast.success(data.message || "Rebuild ferdig");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Rebuild feilet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void run(false)}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Bygger kategorier…" : "Bygg kategorier på nytt"}
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => void run(true)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        Tving alle
      </button>
    </div>
  );
}

