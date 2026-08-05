"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Loader2,
  Brain,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Check,
  X,
  ArrowRight,
  Package,
  Layers,
} from "lucide-react";
import { DataState } from "@/components/admin/DataState";
import { useDataLoad } from "@/components/admin/useDataLoad";
import { classifyAdminError } from "@/lib/admin/data-errors";
import { toFailureState, type LoadState } from "@/lib/admin/load-state";

type CategoryHealth = {
  category: string;
  productCount: number;
  activeCount: number;
  publishedCount: number;
  avgPrice: number | null;
  avgMarginPct: number | null;
  imageScore: number;
  seoScore: number;
  aiScore: number;
  strategy: string[];
  healthScore: number;
  summary: string;
  supplierMix: Record<string, number>;
};

type Gap = {
  id: string;
  severity: string;
  title: string;
  why: string[];
  suggestedQueries: string[];
  anchorCount: number;
  missingCount: number;
  missingFamily?: string;
  expectedMin?: number;
};

type Complement = {
  id: string;
  name: string;
  why: string;
  steps: Array<{ label: string; count: number; status: string }>;
};

type Recommendation = {
  id: string;
  priority: number;
  kind: string;
  title: string;
  why: string[];
  href?: string;
};

type DailyTask = {
  id: string;
  urgency: string;
  title: string;
  detail: string;
  count?: number;
  href: string;
};

type Report = {
  storeHealthScore: number;
  strongestCategory: string | null;
  weakestCategory: string | null;
  bestMarginCategory: string | null;
  lowestMarginCategory: string | null;
  categories: CategoryHealth[];
  gaps: Gap[];
  complements: Complement[];
  recommendations: Recommendation[];
  dailyTasks: DailyTask[];
  supplierMix: Record<string, number>;
  risks: string[];
  livingProfile?: {
    identitySummary: string;
    audienceHint: string | null;
    priceLevelHint: string | null;
    qualityHint: string | null;
    brandHint: string | null;
    categoryFocus: Array<{ category: string; share: number; count: number }>;
  };
  catalogTotals?: { products: number; active: number; inactive: number };
  generatedAt: string;
};

const STRATEGY_LABEL: Record<string, string> = {
  too_small: "For liten",
  balanced: "Passe størrelse",
  overrepresented: "Overrepresentert",
  missing_premium: "Mangler premium",
  missing_budget: "Mangler budsjett",
  missing_mid: "Mangler mellomsegment",
  missing_accessories: "Mangler tilbehør",
  missing_newcomers: "Mangler nyheter",
};

function healthColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-rose-600";
}

function healthBg(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

/** Empty ONLY when analysis completed and catalog truly has nothing. */
function isEmptyReport(report: Report): boolean {
  const products =
    report.catalogTotals?.products ??
    report.categories.reduce((s, c) => s + (c.productCount || 0), 0);
  return products === 0 && (report.categories?.length ?? 0) === 0;
}

function parseIntelligenceJson(json: unknown): Report {
  const data = json as {
    ok?: boolean;
    report?: Report | null;
    error?: string;
    message?: string;
  };
  if (!data || data.ok === false) {
    throw Object.assign(new Error(data?.message || data?.error || "Analyse feilet"), {
      status: 503,
    });
  }
  // Missing report after ok:true → Error, never Empty (we don't know)
  if (!data.report) {
    throw Object.assign(new Error("Analyse returnerte ingen rapport"), {
      status: 503,
    });
  }
  return data.report;
}

async function healthPreflight(): Promise<LoadState<Report> | null> {
  try {
    const res = await fetch("/api/admin/system-health", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    console.warn(
      `[intel:preflight] http=${res.status} status=${json?.status} database=${json?.database} kind=${json?.kind}`
    );

    // ONLY the database service — never overall status (queue/openai/cron must not block analysis)
    const dbService = Array.isArray(json?.services)
      ? json.services.find(
          (s: { id?: string }) => s.id === "database"
        )
      : null;
    const dbStatus =
      (typeof json?.database === "string" ? json.database : null) ||
      dbService?.status;

    if (dbStatus === "down") {
      const kind =
        json?.kind === "quota" || dbService?.kind === "quota"
          ? "quota"
          : "database";
      return toFailureState({
        kind,
        title:
          kind === "quota"
            ? "Database-kvote overskredet"
            : "Databasen er utilgjengelig",
        reason:
          typeof json?.reason === "string"
            ? json.reason
            : dbService?.detail ||
              "Databasen svarer ikke. Analyse kjøres ikke.",
        status: 503,
        logMessage: `preflight database=${dbStatus} kind=${kind}`,
      });
    }
  } catch (e: unknown) {
    console.warn(
      `[intel:preflight] health fetch failed — continuing to analysis: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
  return null;
}

export default function IntelligenceClient() {
  const [intelUrl, setIntelUrl] = useState(
    "/api/admin/intelligence?cached=1"
  );
  const { load, reload } = useDataLoad<Report>({
    url: intelUrl,
    parse: parseIntelligenceJson,
    isEmpty: isEmptyReport,
    keepStaleOnError: true,
    timeoutMs: 10_000,
    preflight: healthPreflight,
  });

  const handleRefresh = useCallback(() => {
    setIntelUrl("/api/admin/intelligence?refresh=1");
    queueMicrotask(() => reload());
  }, [reload]);

  const decide = useCallback(
    async (
      decision:
        | "accept_gap"
        | "dismiss_gap"
        | "accept_recommendation"
        | "dismiss_recommendation",
      subjectType: string,
      subjectKey: string
    ) => {
      try {
        const res = await fetch("/api/admin/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, subjectType, subjectKey }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          toast.error(classifyAdminError(data?.error || "Feil", res.status).reason);
          return;
        }
        toast.success(
          decision.startsWith("accept") ? "Notert — AI lærer" : "Avvist — AI lærer"
        );
      } catch (e: unknown) {
        toast.error(classifyAdminError(e).reason);
      }
    },
    []
  );

  // Priority: Loading → Error → Success (+stale) → Empty
  if (load.status === "loading") {
    return <DataState status="loading" surface="intelligence" />;
  }

  if (
    load.status === "timeout" ||
    load.status === "offline" ||
    load.status === "database" ||
    load.status === "api"
  ) {
    return (
      <DataState
        status={load.status}
        surface="intelligence"
        error={load.error}
        onRetry={handleRefresh}
      />
    );
  }

  if (load.status === "empty") {
    return (
      <DataState status="empty" surface="intelligence" onRetry={handleRefresh} />
    );
  }

  // success (possibly stale)
  const report = load.data;
  const refreshing = false;

  const maxCat = Math.max(1, ...report.categories.map((c) => c.activeCount));
  const supplierEntries = Object.entries(report.supplierMix || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const supplierTotal = supplierEntries.reduce((s, [, n]) => s + n, 0) || 1;

  return (
    <DataState
      status="success"
      staleReason={load.stale ? load.staleReason : null}
      onRetry={handleRefresh}
      surface="intelligence"
    >
      <IntelligenceReportView
        report={report}
        maxCat={maxCat}
        supplierEntries={supplierEntries}
        supplierTotal={supplierTotal}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onDecide={decide}
      />
    </DataState>
  );
}

function IntelligenceReportView({
  report,
  maxCat,
  supplierEntries,
  supplierTotal,
  refreshing,
  onRefresh,
  onDecide,
}: {
  report: Report;
  maxCat: number;
  supplierEntries: [string, number][];
  supplierTotal: number;
  refreshing: boolean;
  onRefresh: () => void;
  onDecide: (
    decision:
      | "accept_gap"
      | "dismiss_gap"
      | "accept_recommendation"
      | "dismiss_recommendation",
    subjectType: string,
    subjectKey: string
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              <Brain size={14} /> Store Intelligence
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Butikkhelse {report.storeHealthScore}/100
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {report.livingProfile?.identitySummary ||
                "Digital kategoriansvarlig — analyserer hele sortimentet."}
            </p>
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Oppdater analyse
          </button>
        </div>
      </div>

      {/* Keep existing sections via compact continuation — key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Sterkest"
          value={report.strongestCategory || "—"}
          icon={<TrendingUp className="text-emerald-600" size={18} />}
        />
        <Metric
          label="Svakest"
          value={report.weakestCategory || "—"}
          icon={<TrendingDown className="text-rose-600" size={18} />}
        />
        <Metric
          label="Best margin"
          value={report.bestMarginCategory || "—"}
          icon={<Sparkles className="text-amber-600" size={18} />}
        />
        <Metric
          label="Kategorier"
          value={String(report.categories.length)}
          icon={<Layers className="text-slate-600" size={18} />}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Kategorihelse</h3>
        <ul className="mt-4 space-y-3">
          {report.categories.map((c) => (
            <li key={c.category} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-800">{c.category}</span>
                <span className={healthColor(c.healthScore)}>
                  {c.healthScore}/100 · {c.activeCount} aktive
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${healthBg(c.healthScore)}`}
                  style={{ width: `${Math.min(100, (c.activeCount / maxCat) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                {(c.strategy || []).map((s) => STRATEGY_LABEL[s] || s).join(" · ") ||
                  c.summary}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {report.gaps.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Hull i sortimentet</h3>
          <ul className="mt-3 space-y-3">
            {report.gaps.map((g) => (
              <li
                key={g.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
              >
                <p className="font-medium text-slate-900">{g.title}</p>
                <p className="mt-1 text-sm text-slate-600">{g.why?.[0]}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/buyer?mission=gap&family=${encodeURIComponent(g.missingFamily || "")}&q=${encodeURIComponent(g.suggestedQueries?.[0] || "")}&want=${Math.max(4, (g.expectedMin || 4) - g.missingCount)}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    Finn gode produkter <ArrowRight size={12} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onDecide("accept_gap", "gap", g.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900"
                  >
                    <Check size={12} /> Godta
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDecide("dismiss_gap", "gap", g.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    <X size={12} /> Avvis
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.recommendations.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Anbefalinger</h3>
          <ul className="mt-3 space-y-2">
            {report.recommendations.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{r.title}</p>
                  <p className="text-xs text-slate-500">{r.why?.[0]}</p>
                </div>
                {r.href ? (
                  <Link
                    href={r.href}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                  >
                    Åpne <ArrowRight size={12} />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.dailyTasks.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-900">
            Hva bør jeg gjøre nå?
          </h3>
          <ul className="space-y-2">
            {report.dailyTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={t.href}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-emerald-200"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.detail}</p>
                  </div>
                  <Package className="mt-0.5 shrink-0 text-slate-400" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {supplierEntries.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Leverandørmiks</h3>
          <ul className="mt-3 space-y-2">
            {supplierEntries.map(([name, n]) => (
              <li key={name} className="flex justify-between text-sm">
                <span>{name}</span>
                <span className="tabular-nums text-slate-600">
                  {n} ({Math.round((n / supplierTotal) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
