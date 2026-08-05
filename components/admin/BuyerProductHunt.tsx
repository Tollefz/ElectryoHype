"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2,
  Pause,
  Play,
  Search,
  Square,
  X,
} from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";

export type HuntScan = {
  id: string;
  status: string;
  targetScanCount: number;
  scanned: number;
  kept: number;
  filtered: number;
  finishedAt: string | null;
  error: string | null;
  startedAt?: string | null;
};

type Ops = {
  targetKept?: number | null;
  scanned?: number;
  kept?: number;
  filtered?: number;
  target?: number;
  /** Processing-window speed from Buyer Hunt Worker (not UI poll clock). */
  productsPerMin?: number | null;
};

type Props = {
  scan: HuntScan | null;
  ops?: Ops | null;
  busy?: boolean;
  onChanged: () => void | Promise<void>;
};

const PRESETS = [100, 500, 1000, 2000] as const;

/**
 * Primary entry: Finn nye produkter — start/pause/resume/stop product hunt.
 */
export function BuyerProductHunt({ scan, ops, busy: parentBusy, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<number | "custom">(500);
  const [custom, setCustom] = useState("500");
  const [busy, setBusy] = useState(false);
  const [scrolledPast, setScrolledPast] = useState(false);

  const status = scan?.status || "";
  const running = status === "running" || status === "queued";
  const paused = status === "paused";
  const active = running || paused;
  const scanned = ops?.scanned ?? scan?.scanned ?? 0;
  const kept = ops?.kept ?? scan?.kept ?? 0;
  const targetKept = ops?.targetKept ?? null;
  const goal = targetKept && targetKept > 0 ? targetKept : null;

  useEffect(() => {
    const onScroll = () => setScrolledPast(window.scrollY > 280);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const perMin =
    running && ops?.productsPerMin != null && ops.productsPerMin > 0
      ? Math.round(ops.productsPerMin)
      : null;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || data?.message || "Feil");
      }
      await onChanged();
      return data;
    } catch (e: unknown) {
      toast.error(classifyAdminError(e).reason);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function startHunt() {
    const n =
      preset === "custom"
        ? Math.round(Number(custom.replace(/\s/g, "")))
        : preset;
    if (!Number.isFinite(n) || n < 10 || n > 50_000) {
      toast.error("Velg mellom 10 og 50 000 kandidater");
      return;
    }
    try {
      const data = await post({
        action: "start_product_hunt",
        targetKept: n,
        processInline: n <= 25,
      });
      toast.success(
        data?.message ||
          `Leter etter opptil ${n.toLocaleString("no-NO")} gode kandidater`
      );
      setOpen(false);
    } catch {
      /* toasted */
    }
  }

  function scrollToHunt() {
    document
      .getElementById("buyer-product-hunt")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const disabled = busy || parentBusy;

  const statsRow = (
    <dl className="grid gap-3 sm:grid-cols-3 text-sm">
      <div>
        <dt className="text-xs font-medium text-emerald-800/70">Analysert</dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-950">
          {scanned.toLocaleString("no-NO")}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-emerald-800/70">
          Gode kandidater
        </dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-950">
          {kept.toLocaleString("no-NO")}
          {goal != null ? ` / ${goal.toLocaleString("no-NO")}` : ""}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-emerald-800/70">Hastighet</dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-950">
          {perMin != null ? `${perMin.toLocaleString("no-NO")} / min` : "—"}
        </dd>
      </div>
    </dl>
  );

  return (
    <div id="buyer-product-hunt" className="scroll-mt-4 space-y-3">
      {/* Idle — dominant start CTA */}
      {!active && (
        <section className="rounded-2xl border-2 border-emerald-600/30 bg-gradient-to-br from-emerald-50 via-white to-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            AI-produktjakt
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Start ny produktjakt
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
            AI søker leverandørkatalogen og finner produkter som passer butikken
            og det den har lært av JA/NEI.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-700 px-8 py-4 text-lg font-semibold text-white shadow-md shadow-emerald-900/15 hover:bg-emerald-600 disabled:opacity-50 sm:w-auto sm:min-w-[280px]"
          >
            <Search className="h-5 w-5" />
            Finn nye produkter
          </button>
          <p className="mt-3 text-sm text-slate-500">
            Neste steg: velg antall gode kandidater (f.eks. 500 eller 2000), så
            starter jakten.
          </p>
        </section>
      )}

      {/* Running */}
      {running && (
        <section className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-6 shadow-sm sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            AI-produktjakt
          </p>
          <h2 className="mt-1 text-xl font-semibold text-emerald-950 sm:text-2xl">
            AI leter etter produkter
          </h2>
          <div className="mt-5">{statsRow}</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                void post({ action: "pause_mission", scanRunId: scan?.id }).then(
                  () => toast.success("Pauset — checkpoint lagret")
                )
              }
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm hover:bg-emerald-50"
            >
              <Pause className="h-4 w-4" /> Pause
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                void post({
                  action: "stop_mission",
                  scanRunId: scan?.id,
                  reason: "Avsluttet fra Produktkjøper",
                }).then(() => toast.success("Avsluttet"))
              }
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50"
            >
              <Square className="h-4 w-4" /> Avslutt
            </button>
          </div>
          {goal != null && kept >= goal && (
            <p className="mt-3 text-sm font-medium text-emerald-900">
              Mål nådd: {kept.toLocaleString("no-NO")} gode kandidater.
            </p>
          )}
          {scan?.error && (
            <p className="mt-3 text-sm text-rose-700">{scan.error}</p>
          )}
        </section>
      )}

      {/* Paused */}
      {paused && (
        <section className="rounded-2xl border-2 border-amber-400/80 bg-amber-50 p-6 shadow-sm sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
            AI-produktjakt
          </p>
          <h2 className="mt-1 text-xl font-semibold text-amber-950 sm:text-2xl">
            Produktjakten er pauset
          </h2>
          <p className="mt-1 text-sm text-amber-900/80">
            Checkpoint er lagret — du kan fortsette der du slapp.
          </p>
          <div className="mt-5">{statsRow}</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                void post({
                  action: "resume_mission",
                  scanRunId: scan?.id,
                }).then(() => toast.success("Fortsetter"))
              }
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              <Play className="h-4 w-4" /> Fortsett
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                void post({
                  action: "stop_mission",
                  scanRunId: scan?.id,
                  reason: "Avsluttet fra Produktkjøper",
                }).then(() => toast.success("Avsluttet"))
              }
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50"
            >
              <Square className="h-4 w-4" /> Avslutt
            </button>
          </div>
        </section>
      )}

      {!active &&
        scan?.status === "completed" &&
        goal != null &&
        kept < goal && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Fant {kept.toLocaleString("no-NO")} sterke kandidater av mål{" "}
            {goal.toLocaleString("no-NO")}. Kvalitet ble ikke senket for å fylle
            kvoten.
          </div>
        )}

      {/* Sticky mini-bar when scrolled past hunt */}
      {scrolledPast && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(100%-1.5rem,28rem)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur sm:left-[calc(50%+7rem)]">
          {!active ? (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
                Start ny produktjakt
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(true)}
                className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Finn nye produkter
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={scrollToHunt}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {paused
                    ? "Produktjakten er pauset"
                    : "AI leter etter produkter"}
                </span>
                <span className="block truncate text-xs text-slate-500 tabular-nums">
                  {kept.toLocaleString("no-NO")}
                  {goal != null ? ` / ${goal.toLocaleString("no-NO")}` : ""}{" "}
                  gode · {scanned.toLocaleString("no-NO")} analysert
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-emerald-700">
                Vis ↑
              </span>
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-labelledby="hunt-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3
                  id="hunt-title"
                  className="text-xl font-semibold text-slate-900"
                >
                  Hvor mange gode kandidater?
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Ønsket antall <strong>anbefalte</strong> produkter — ikke rå
                  scan. AI bruker butikkpreferanser og JA/NEI. Kvalitet trumfer
                  kvote.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Lukk"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPreset(n)}
                  className={`rounded-xl px-3 py-3 text-base font-semibold ${
                    preset === n
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "border border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-300"
                  }`}
                >
                  {n.toLocaleString("no-NO")}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={`rounded-xl px-3 py-3 text-base font-semibold ${
                  preset === "custom"
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-300"
                }`}
              >
                Egendefinert
              </button>
            </div>

            {preset === "custom" && (
              <input
                type="number"
                min={10}
                max={50000}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
                placeholder="F.eks. 2000"
              />
            )}

            <p className="mt-3 text-xs text-slate-500">
              Standard er 500. For 2000 kan systemet analysere mange flere
              leverandørprodukter — med checkpoint, pause og batching.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void startHunt()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-base font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
                Start jakt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
