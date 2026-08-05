"use client";

import { useCallback, useEffect, useState } from "react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";

type DiscoverySnippet = {
  activeFamily: { label: string } | null;
  nextFamilies: Array<{ label: string }>;
};

type Props = {
  /** Poll while hunt is running/queued */
  live?: boolean;
};

/**
 * Compact Discovery status for Produktkjøper work surface.
 * Full analysis lives in AI Mission Control.
 */
export function BuyerHuntLiveStatus({ live }: Props) {
  const [discovery, setDiscovery] = useState<DiscoverySnippet | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/buyer?view=mission_control");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) return;
      const d = json.missionControl?.discovery;
      if (!d) return;
      setDiscovery({
        activeFamily: d.activeFamily
          ? { label: String(d.activeFamily.label || "") }
          : null,
        nextFamilies: Array.isArray(d.nextFamilies)
          ? d.nextFamilies
              .slice(0, 3)
              .map((f: { label?: string }) => ({
                label: String(f.label || ""),
              }))
              .filter((f: { label: string }) => f.label)
          : [],
      });
    } catch {
      /* keep last snippet */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPoll({
    tick: load,
    active: Boolean(live),
    activeMs: 8_000,
    idleMs: null,
    enabled: Boolean(live),
  });

  if (!live) return null;

  const now = discovery?.activeFamily?.label?.trim();
  const next = (discovery?.nextFamilies || [])
    .map((f) => f.label.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!now && next.length === 0) {
    return (
      <p className="text-sm text-slate-600">AI søker nå…</p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800">
      {now ? (
        <p>
          <span className="text-slate-500">AI søker nå:</span>{" "}
          <span className="font-semibold text-slate-900">{now}</span>
        </p>
      ) : (
        <p className="text-slate-600">AI søker nå…</p>
      )}
      {next.length > 0 ? (
        <p className="mt-0.5 text-slate-600">
          <span className="text-slate-500">Neste:</span> {next.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
