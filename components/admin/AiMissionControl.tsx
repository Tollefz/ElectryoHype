"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Loader2, Radar } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { MissionControlSnapshot } from "@/lib/buyer/mission-control";
import { FriendlySupplierErrorAlert } from "@/components/admin/FriendlySupplierErrorAlert";
import { formatFriendlySupplierError } from "@/lib/buyer/cj-errors";

type Props = {
  /** Auto-refresh when a hunt is live */
  live?: boolean;
};

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusPill({
  status,
}: {
  status: "running" | "idle" | "stopped";
}) {
  const styles =
    status === "running"
      ? "bg-emerald-100 text-emerald-900"
      : status === "idle"
        ? "bg-amber-100 text-amber-950"
        : "bg-slate-200 text-slate-700";
  const label =
    status === "running" ? "Running" : status === "idle" ? "Idle" : "Stopped";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}
    >
      {label}
    </span>
  );
}

function Section({
  title,
  children,
  alert,
}: {
  title: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
        alert ? "border-red-300 ring-1 ring-red-200" : "border-slate-200"
      }`}
    >
      <h3 className="text-sm font-semibold tracking-tight text-slate-900">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          warn ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Read-only AI Mission Control — observe Product Hunt decision chain.
 * Never starts workers or mutates AI state.
 */
export function AiMissionControl({ live }: Props) {
  const [data, setData] = useState<MissionControlSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/buyer?view=mission_control");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Kunne ikke hente Mission Control");
      }
      setData(json.missionControl as MissionControlSnapshot);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Feil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPoll({
    tick: load,
    active: Boolean(live || data?.scanner.status === "running"),
    activeMs: 8_000,
    idleMs: 30_000,
    enabled: true,
  });

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Leser Mission Control…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-semibold underline"
        >
          Prøv igjen
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { worker, discovery, scanner, candidates, merchTop, economy, system, timeline } =
    data;
  const aiMemory = data.aiMemory ?? {
    memoryScore: 50,
    published: 0,
    rejected: 0,
    liked: 0,
    disliked: 0,
    deleted: 0,
    learnedLast30d: 0,
    patternCount: 0,
    rebuiltAt: data.generatedAt,
    topPositive: [],
    topNegative: [],
  };
  const storeDna = data.storeDna ?? {
    rebuiltAt: data.generatedAt,
    productCount: 0,
    traits: [],
    changeWeek: [],
    changeMonth: [],
    strengthens: [],
    weakens: [],
  };
  const storeIdentity = data.storeIdentity ?? {
    rebuiltAt: data.generatedAt,
    contextStoreName: "Butikken",
    catalogProductCount: 0,
    lowFitCandidates: [],
    commonReasons: [],
    rejectedCategoryHints: [],
    strengthensProfile: [],
    avgFitRecent: null,
    rejectBandCount: 0,
    weakBandCount: 0,
  };
  const aiFeedback = data.aiFeedback ?? {
    rebuiltAt: data.generatedAt,
    topPerforming: [],
    worstPerforming: [],
    learningNow: [],
    positive: [],
    negative: [],
    confidenceOverTime: [],
    familyHistory: [],
    stubs: { clicksViews: "", trueReturns: "" },
  };
  const workerAlert = worker.stalePendingAlert;
  const apiFriendly = formatFriendlySupplierError(scanner.error);
  const target = scanner.target || 0;
  const scanPct =
    target > 0 ? Math.min(100, Math.round((scanner.scanned / target) * 100)) : null;
  const phaseSteps = buildMissionPhases(data);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Operasjonssenter
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              <Radar className="h-5 w-5 text-emerald-700" />
              AI Mission Control
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Hva AI gjør nå, hvor langt jakten har kommet, og om noe krever
              handling. Panelet endrer aldri AI eller køen.
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Oppdatert {fmtTime(data.generatedAt)}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-1 inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline"
            >
              <Activity className="h-3.5 w-3.5" />
              Oppdater nå
            </button>
          </div>
        </div>
        {workerAlert ? (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {worker.status === "stopped"
                ? "Worker er Stopped (heartbeat ≥60s) mens "
                : `Worker er idle i ${Math.round(worker.idleMs / 1000)}s mens `}
              {worker.pendingJobs} pending jobber venter. Sjekk at{" "}
              <code className="rounded bg-red-100 px-1">npm run worker:buyer-hunt</code>{" "}
              kjører kontinuerlig.
            </p>
          </div>
        ) : null}
        {apiFriendly ? (
          <div className="mt-4">
            <FriendlySupplierErrorAlert friendly={apiFriendly} raw={scanner.error} />
          </div>
        ) : null}
      </header>

      <Section title="Fase">
        <ol className="space-y-2 text-sm">
          {phaseSteps.map((step) => (
            <li key={step.id} className="flex items-center gap-2">
              <span className="w-5 text-center">
                {step.state === "done"
                  ? "✓"
                  : step.state === "active"
                    ? "▶"
                    : "○"}
              </span>
              <span
                className={
                  step.state === "active"
                    ? "font-semibold text-emerald-900"
                    : step.state === "done"
                      ? "text-slate-700"
                      : "text-slate-400"
                }
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Discovery">
        {scanPct != null ? (
          <p className="mb-2 font-mono text-sm tabular-nums text-slate-800">
            {bar12(scanPct)} {scanner.scanned.toLocaleString("no-NO")} /{" "}
            {target.toLocaleString("no-NO")}
          </p>
        ) : (
          <p className="mb-2 text-sm tabular-nums text-slate-700">
            Analysert {scanner.scanned.toLocaleString("no-NO")}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Produkter/min"
            value={
              scanner.productsPerMin != null
                ? String(scanner.productsPerMin)
                : "—"
            }
          />
          <Metric
            label="Estimert ferdig"
            value={
              scanner.productsPerMin && target > scanner.scanned
                ? `${Math.round(
                    (target - scanner.scanned) / scanner.productsPerMin
                  )} min`
                : "—"
            }
          />
          <Metric label="Jobs pending" value={worker.pendingJobs} />
          <Metric label="Worker" value={worker.status} warn={workerAlert} />
        </dl>
        {discovery.activeFamily ? (
          <p className="mt-3 text-sm text-slate-700">
            AI søker nå:{" "}
            <span className="font-semibold">{discovery.activeFamily.label}</span>
          </p>
        ) : null}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Worker" alert={workerAlert}>
          <div className="mb-3 flex items-center gap-2">
            <StatusPill status={worker.status} />
            <span className="text-xs text-slate-500">
              Sist aktiv {fmtTime(worker.lastActiveAt)}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Pending" value={worker.pendingJobs} warn={workerAlert} />
            <Metric label="Claimed" value={worker.claimedJobs} />
            <Metric label="Jobs/min" value={worker.jobsPerMinute || "—"} />
            <Metric label="Snitt ventetid" value={fmtMs(worker.avgWaitMs)} />
            <Metric label="Snitt kjøretid" value={fmtMs(worker.avgRuntimeMs)} />
            <Metric
              label="Eldste pending"
              value={
                worker.oldestPending
                  ? `${worker.oldestPending.id.slice(-8)} · ${fmtMs(worker.oldestPending.waitMs)}`
                  : "—"
              }
              warn={
                !!worker.oldestPending && worker.oldestPending.waitMs >= 5 * 60_000
              }
            />
          </dl>
          {worker.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-900">
              {worker.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section title="Scanner">
          <p className="mb-2 text-sm text-slate-600">
            {scanner.stageLabel || "Ingen aktiv stage"} ·{" "}
            <span className="font-medium text-slate-800">
              {scanner.status || "—"}
            </span>
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              label="CJ-søk"
              value={scanner.cjSearchQuery || scanner.seedQuery || "—"}
            />
            <Metric label="Analysert" value={scanner.scanned} />
            <Metric
              label="Hastighet"
              value={
                scanner.productsPerMin != null
                  ? `${scanner.productsPerMin}/min`
                  : "—"
              }
            />
            <Metric label="Kandidater" value={scanner.kept} />
            <Metric label="Filtrert" value={scanner.filtered} />
            <Metric
              label="Checkpoint"
              value={`p${scanner.checkpoint.page ?? "—"} · s${scanner.checkpoint.seedIdx ?? "—"}`}
            />
          </dl>
          {scanner.error && !apiFriendly ? (
            <div className="mt-3">
              <FriendlySupplierErrorAlert raw={scanner.error} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(scanner.rejectBreakdown)
              .filter(([, n]) => n > 0)
              .slice(0, 8)
              .map(([k, n]) => (
                <span
                  key={k}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  {k}: {n}
                </span>
              ))}
          </div>
        </Section>
      </div>

      <Section title="Discovery — detalj">
        {discovery.activeFamily ? (
          <div className="mb-3 rounded-xl bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
            <p className="font-semibold">
              Aktiv: {discovery.activeFamily.label}{" "}
              <span className="font-normal text-emerald-800/80">
                ({discovery.activeFamily.groupLabel})
              </span>
            </p>
            <p className="mt-0.5 text-xs">
              Query: «{discovery.activeFamily.query}» · need{" "}
              {discovery.activeFamily.needScore ?? "—"} · fatigue{" "}
              {discovery.activeFamily.fatiguePct != null
                ? `${Math.round(discovery.activeFamily.fatiguePct * 100)}%`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-emerald-900/80">
              {discovery.activeFamily.reason}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-sm text-slate-500">
            Ingen aktiv discovery-plan ennå. Når jakten kjører, vises familievalg
            her.
          </p>
        )}

        {discovery.whyChosen.length > 0 ? (
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Hvorfor valgt
            </p>
            <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
              {discovery.whyChosen.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Neste 10 familier
            </p>
            <ol className="mt-1 space-y-1 text-sm text-slate-700">
              {discovery.nextFamilies.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : (
                discovery.nextFamilies.map((f, i) => (
                  <li key={`${f.familyId}-${i}`}>
                    <span className="font-medium">{f.label}</span>
                    <span className="text-slate-500"> · {f.groupLabel}</span>
                    <span className="block text-xs text-slate-500">
                      {f.reason}
                    </span>
                  </li>
                ))
              )}
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Utsatt (deferred)
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {discovery.deferred.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : (
                discovery.deferred.map((d) => (
                  <li key={d.familyId}>
                    <span className="font-medium">{d.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · need {Math.round(d.needScore)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {d.reasons.join(" · ") || d.groupLabel}
                    </span>
                  </li>
                ))
              )}
            </ul>
            {discovery.groupQuotas.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {discovery.groupQuotas.map((g) => (
                  <span
                    key={g.groupId}
                    className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    {g.label}: {g.pct}%
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="AI Memory — butikk-erfaring">
        <p className="mb-3 text-sm text-slate-600">
          Langtidshukommelse fra tidligere jakter. Trekker Butikkscore maks ±3 —
          kan aldri gjøre et dårlig produkt bra.
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="AI Memory Score" value={aiMemory.memoryScore} />
          <Metric label="Publiserte" value={aiMemory.published} />
          <Metric label="Avviste" value={aiMemory.rejected} />
          <Metric label="Lært siste 30d" value={aiMemory.learnedLast30d} />
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          Oppdatert {fmtTime(aiMemory.rebuiltAt)} · {aiMemory.patternCount}{" "}
          mønstre · liked {aiMemory.liked} · disliked {aiMemory.disliked} ·
          slettet {aiMemory.deleted}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">
              Top positive patterns
            </p>
            <ul className="mt-1 space-y-1.5 text-sm text-slate-700">
              {aiMemory.topPositive.length === 0 ? (
                <li className="text-slate-400">Ingen positive mønstre ennå</li>
              ) : (
                aiMemory.topPositive.map((p) => (
                  <li key={`pos-${p.label}-${p.kind}`}>
                    <span className="font-medium">✔ {p.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · exp {p.experience} · pub {p.published}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p.why[0] || p.kind}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-900">
              Top negative patterns
            </p>
            <ul className="mt-1 space-y-1.5 text-sm text-slate-700">
              {aiMemory.topNegative.length === 0 ? (
                <li className="text-slate-400">Ingen negative mønstre ennå</li>
              ) : (
                aiMemory.topNegative.map((p) => (
                  <li key={`neg-${p.label}-${p.kind}`}>
                    <span className="font-medium">⚠ {p.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · exp {p.experience} · avvist {p.rejected}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p.why[0] || p.kind}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Store Identity — passer butikkens profil?">
        <p className="mb-3 text-sm text-slate-600">
          Ville en kunde forventet å finne dette hos {storeIdentity.contextStoreName}?
          Score før Merch Brain — styrt av Store Profile / DNA / fokus / Memory, ikke
          ordbokfiltre.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label="Snitt fit (nylig)"
            value={storeIdentity.avgFitRecent ?? "—"}
          />
          <Metric label="Reject-band" value={storeIdentity.rejectBandCount} />
          <Metric label="Svak fit" value={storeIdentity.weakBandCount} />
          <Metric
            label="Katalog"
            value={storeIdentity.catalogProductCount}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lav identitetsscore
            </p>
            <ul className="space-y-1.5 text-sm">
              {storeIdentity.lowFitCandidates.length === 0 ? (
                <li className="text-slate-400">Ingen lave treff i siste kandidater</li>
              ) : (
                storeIdentity.lowFitCandidates.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <span className="font-medium text-rose-900">
                      {c.score}/100
                    </span>{" "}
                    <span className="text-slate-800">{c.title.slice(0, 48)}</span>
                    <span className="block text-xs text-slate-500">{c.why}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vanligste årsaker
            </p>
            <ul className="space-y-1 text-sm text-slate-700">
              {storeIdentity.commonReasons.length === 0 ? (
                <li className="text-slate-400">Ingen ennå</li>
              ) : (
                storeIdentity.commonReasons.map((r) => (
                  <li key={r.reason.slice(0, 40)}>
                    <span className="font-medium">{r.count}×</span> {r.reason}
                  </li>
                ))
              )}
            </ul>
            <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Kategorier AI avviser
            </p>
            <ul className="space-y-1 text-sm text-slate-700">
              {storeIdentity.rejectedCategoryHints.length === 0 ? (
                <li className="text-slate-400">Ingen ennå</li>
              ) : (
                storeIdentity.rejectedCategoryHints.map((r) => (
                  <li key={r.label}>
                    {r.label} · {r.count}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Styrker butikkens profil
          </p>
          <ul className="space-y-1.5 text-sm">
            {storeIdentity.strengthensProfile.length === 0 ? (
              <li className="text-slate-400">Ingen sterke treff i siste kandidater</li>
            ) : (
              storeIdentity.strengthensProfile.slice(0, 6).map((s, i) => (
                <li key={`${s.title}-${i}`}>
                  <span className="font-medium text-emerald-800">
                    {s.score}/100
                  </span>{" "}
                  {s.title.slice(0, 48)}
                  <span className="block text-xs text-slate-500">{s.why}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </Section>

      <Section title="Store DNA — hva butikken har blitt">
        <p className="mb-3 text-sm text-slate-600">
          Observert identitet fra publiserte produkter (ikke Produktfokus). Lite
          signal (±2) — dominerer aldri.
        </p>
        <p className="mb-3 text-xs text-slate-500">
          {storeDna.productCount} aktive produkter · oppdatert{" "}
          {fmtTime(storeDna.rebuiltAt)}
        </p>
        <ul className="space-y-1.5">
          {storeDna.traits.length === 0 ? (
            <li className="text-sm text-slate-400">
              Ingen DNA ennå — publiser produkter for å lære identitet.
            </li>
          ) : (
            storeDna.traits
              .filter((t) => t.pct > 0)
              .slice(0, 12)
              .map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 font-medium text-slate-800">
                    {t.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${Math.min(100, t.pct)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right tabular-nums text-slate-600">
                    {t.pct}%
                  </span>
                </li>
              ))
          )}
        </ul>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Endring siste uke
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {storeDna.changeWeek.length === 0 ? (
                <li className="text-slate-400">For lite historikk</li>
              ) : (
                storeDna.changeWeek.map((c) => (
                  <li key={`w-${c.id}`}>
                    {c.label}:{" "}
                    <span
                      className={
                        c.delta >= 0 ? "text-emerald-700" : "text-amber-800"
                      }
                    >
                      {c.delta >= 0 ? "+" : ""}
                      {c.delta} pp
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Endring siste måned
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {storeDna.changeMonth.length === 0 ? (
                <li className="text-slate-400">For lite historikk</li>
              ) : (
                storeDna.changeMonth.map((c) => (
                  <li key={`m-${c.id}`}>
                    {c.label}:{" "}
                    <span
                      className={
                        c.delta >= 0 ? "text-emerald-700" : "text-amber-800"
                      }
                    >
                      {c.delta >= 0 ? "+" : ""}
                      {c.delta} pp
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">
              Styrker identiteten
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {storeDna.strengthens.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : (
                storeDna.strengthens.map((s) => (
                  <li key={s.productId}>
                    <span className="font-medium">{s.title}</span>
                    <span className="block text-xs text-slate-500">{s.why}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-900">
              Svekker identiteten
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {storeDna.weakens.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : (
                storeDna.weakens.map((s) => (
                  <li key={s.productId}>
                    <span className="font-medium">{s.title}</span>
                    <span className="block text-xs text-slate-500">{s.why}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Feedback — butikkprestasjon">
        <p className="mb-3 text-sm text-slate-600">
          Læring fra salg, margin, refusjoner og lager — ikke bare Discovery.
          Liten bonus/straff (±2), aldri absolutt.
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Oppdatert {fmtTime(aiFeedback.rebuiltAt)}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">
              Top Performing Product Types
            </p>
            <ul className="mt-1 space-y-1.5 text-sm">
              {aiFeedback.topPerforming.length === 0 ? (
                <li className="text-slate-400">Ingen data ennå</li>
              ) : (
                aiFeedback.topPerforming.map((e) => (
                  <li key={`top-${e.label}`}>
                    <span className="font-medium text-slate-900">{e.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · conf {e.confidence} · solgt {e.unitsSold}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {e.why[0]}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-900">
              Worst Performing Product Types
            </p>
            <ul className="mt-1 space-y-1.5 text-sm">
              {aiFeedback.worstPerforming.length === 0 ? (
                <li className="text-slate-400">Ingen data ennå</li>
              ) : (
                aiFeedback.worstPerforming.map((e) => (
                  <li key={`worst-${e.label}`}>
                    <span className="font-medium text-slate-900">{e.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · conf {e.confidence} · solgt {e.unitsSold}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {e.why[0]}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Lærer akkurat nå
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {aiFeedback.learningNow.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : (
                aiFeedback.learningNow.slice(0, 6).map((e) => (
                  <li key={`learn-${e.label}`}>
                    {e.label} · {e.confidence}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">
              Positive erfaringer
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {aiFeedback.positive.slice(0, 5).map((e) => (
                <li key={`pos-fb-${e.label}`}>
                  ✔ {e.label}
                  <span className="block text-xs text-slate-500">{e.why[0]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-900">
              Negative erfaringer
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {aiFeedback.negative.slice(0, 5).map((e) => (
                <li key={`neg-fb-${e.label}`}>
                  ⚠ {e.label}
                  <span className="block text-xs text-slate-500">{e.why[0]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Confidence over tid
          </p>
          <ul className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
            {aiFeedback.confidenceOverTime.length === 0 ? (
              <li className="text-slate-400">Bygger historikk…</li>
            ) : (
              aiFeedback.confidenceOverTime.slice(0, 8).map((h) => (
                <li
                  key={h.at}
                  className="rounded-lg bg-slate-100 px-2 py-1 tabular-nums"
                >
                  {fmtTime(h.at)}: {h.avgConfidence}
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Historikk per produktfamilie
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm text-slate-700">
            {aiFeedback.familyHistory.length === 0 ? (
              <li className="text-slate-400">—</li>
            ) : (
              aiFeedback.familyHistory.map((f) => (
                <li key={f.label}>
                  <span className="font-medium">{f.label}</span>
                  <span className="text-slate-500">
                    {" "}
                    ·{" "}
                    {f.points
                      .slice(-4)
                      .map((p) => p.confidence)
                      .join(" → ")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
        {(aiFeedback.stubs.clicksViews || aiFeedback.stubs.trueReturns) && (
          <p className="mt-3 text-xs text-slate-400">
            {aiFeedback.stubs.trueReturns} {aiFeedback.stubs.clicksViews}
          </p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Kandidater">
          <dl className="grid grid-cols-3 gap-3">
            <Metric label="Totalt" value={candidates.total} />
            <Metric label="Siste time" value={candidates.lastHour} />
            <Metric label="Siste 24t" value={candidates.last24h} />
          </dl>
          <p className="mt-3 text-xs font-semibold uppercase text-slate-500">
            Topp familier (24t)
          </p>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-sm">
            {candidates.topFamilies.map((f) => (
              <li
                key={f.familyId}
                className="flex justify-between gap-2 text-slate-700"
              >
                <span>{f.label}</span>
                <span className="tabular-nums text-slate-500">{f.count}</span>
              </li>
            ))}
          </ul>
          {candidates.underrepresented.length > 0 ? (
            <>
              <p className="mt-3 text-xs font-semibold uppercase text-slate-500">
                Underrepresentert
              </p>
              <ul className="mt-1 space-y-1 text-sm text-slate-700">
                {candidates.underrepresented.map((u) => (
                  <li key={u.familyId}>
                    {u.label} · need {Math.round(u.needScore)} · have{" "}
                    {u.catalogHave}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {candidates.byCategory.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {candidates.byCategory.slice(0, 10).map((c) => (
                <span
                  key={c.category}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  {c.category}: {c.count}
                </span>
              ))}
            </div>
          ) : null}
        </Section>

        <Section title="Økonomi">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              label="Snittmargin"
              value={
                economy.avgMarginPct != null
                  ? `${economy.avgMarginPct}%`
                  : "—"
              }
            />
            <Metric
              label="Medianmargin"
              value={
                economy.medianMarginPct != null
                  ? `${economy.medianMarginPct}%`
                  : "—"
              }
            />
            <Metric label="Under mål (&lt;35%)" value={economy.belowTarget} />
            <Metric label="Prisfeil" value={economy.priceErrors} />
            <Metric label="Landed cost-feil" value={economy.landedCostErrors} />
            <Metric label="Valutafeil" value={economy.currencyErrors} />
            <Metric
              label="Øk. sikkerhet"
              value={
                economy.avgEconomicConfidence != null
                  ? `${economy.avgEconomicConfidence}%`
                  : "—"
              }
            />
            <Metric label="Utvalg" value={economy.sampleSize} />
          </dl>
        </Section>
      </div>

      <Section title="Merch Score — topp 20">
        {merchTop.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ingen rangerte kandidater ennå. Når AI finner produkter, vises
            søylebidrag her.
          </p>
        ) : (
          <ul className="space-y-3">
            {merchTop.map((c, idx) => (
              <li
                key={c.id}
                className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    #{c.rank ?? idx + 1} {c.title}
                  </p>
                  <p className="text-xs text-slate-600">
                    Butikkscore {c.butikkscore} · match {c.shopMatchPct}% ·{" "}
                    {c.recommendation}
                    {c.memoryNudge !== 0
                      ? ` · memory ${c.memoryNudge > 0 ? "+" : ""}${c.memoryNudge}`
                      : ""}
                  </p>
                </div>
                {c.memoryWhy?.length ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {c.memoryWhy[0]}
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                  {c.pillars.slice(0, 10).map((p) => (
                    <div
                      key={`${c.id}-${p.id}`}
                      className="rounded-lg bg-white px-2 py-1 text-[11px] text-slate-700"
                    >
                      <span className="font-medium">{p.label}</span>
                      <span className="ml-1 tabular-nums text-slate-500">
                        {p.points}/{p.max}
                      </span>
                      {p.detail ? (
                        <span className="block truncate text-slate-400">
                          {p.detail}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="System">
          <dl className="grid grid-cols-2 gap-3">
            <Metric
              label="API/DB latency"
              value={
                system.apiLatencyMs != null ? `${system.apiLatencyMs} ms` : "—"
              }
              warn={!system.dbOk}
            />
            <Metric label="Queue-størrelse" value={system.queueSize} />
            <Metric
              label="Memory RSS"
              value={
                system.memory.rssMb != null ? `${system.memory.rssMb} MB` : "—"
              }
            />
            <Metric
              label="Heap"
              value={
                system.memory.heapUsedMb != null
                  ? `${system.memory.heapUsedMb} MB`
                  : "—"
              }
            />
            <Metric
              label="CPU load"
              value={
                system.cpu.loadAvg1 != null
                  ? system.cpu.loadAvg1.toFixed(2)
                  : "—"
              }
            />
            <Metric label="Feil siste time" value={system.errorsLastHour} />
          </dl>
          <p className="mt-3 text-xs text-slate-500">{system.cjCallsNote}</p>
          <p className="text-xs text-slate-500">
            Cache: {system.cacheHitRate}. {system.reactQueryCache}
          </p>
        </Section>

        <Section title="Tidslinje (24t)">
          <ol className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {timeline.length === 0 ? (
              <li className="text-slate-400">Ingen hendelser ennå.</li>
            ) : (
              timeline.map((ev, i) => (
                <li
                  key={`${ev.at}-${ev.kind}-${i}`}
                  className="border-l-2 border-slate-200 pl-3"
                >
                  <p className="text-[11px] text-slate-500">
                    {fmtTime(ev.at)} · {ev.kind}
                  </p>
                  <p className="font-medium text-slate-800">{ev.title}</p>
                  {ev.detail ? (
                    <p className="truncate text-xs text-slate-500">{ev.detail}</p>
                  ) : null}
                </li>
              ))
            )}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function bar12(pct: number): string {
  const filled = Math.max(0, Math.min(12, Math.round((pct / 100) * 12)));
  return `${"█".repeat(filled)}${"░".repeat(12 - filled)}`;
}

function buildMissionPhases(data: MissionControlSnapshot): Array<{
  id: string;
  label: string;
  state: "done" | "active" | "pending";
}> {
  const scan = data.scanner;
  const worker = data.worker;
  const apiBlocked =
    formatFriendlySupplierError(scan.error)?.kind === "api_points";
  const hunting =
    scan.status === "running" ||
    scan.status === "queued" ||
    worker.status === "running";
  const hasCandidates = (scan.kept || 0) > 0 || (data.candidates?.total ?? 0) > 0;
  const publishing = data.publishJob?.status === "running";

  let active = 0;
  if (apiBlocked) active = 0;
  else if (publishing) active = 3;
  else if (hunting && (scan.scanned || 0) > 0) active = 0;
  else if (hunting) active = 1;
  else if (hasCandidates) active = 2;
  else if (scan.status === "completed" || scan.status === "failed") active = 5;
  else active = -1;

  const labels = [
    { id: "scan", label: "Discovery" },
    { id: "learn", label: "Analyse" },
    { id: "cand", label: "Kandidater" },
    { id: "pub", label: "Publisering" },
    { id: "imp", label: "Importer" },
    { id: "done", label: "Ferdig" },
  ];

  return labels.map((l, i) => ({
    ...l,
    state:
      active < 0
        ? ("pending" as const)
        : i < active
          ? ("done" as const)
          : i === active
            ? ("active" as const)
            : ("pending" as const),
  }));
}
