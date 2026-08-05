"use client";

import type {
  HuntReportShareRow,
  ProductHuntReport,
} from "@/lib/buyer/hunt-report";

function fmtPct(n: number | null | undefined): string {
  return n == null ? "—" : `${n} %`;
}

function fmtNum(n: number | null | undefined, suffix = ""): string {
  return n == null ? "—" : `${n.toLocaleString("no-NO")}${suffix}`;
}

function ShareTable({
  rows,
  showTargetCount,
}: {
  rows: HuntReportShareRow[];
  showTargetCount?: boolean;
}) {
  if (!rows.length) {
    return (
      <p className="text-xs text-slate-500">Ingen data i denne listen.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1.5 pr-2 font-semibold">Navn</th>
            <th className="py-1.5 pr-2 font-semibold tabular-nums">Antall</th>
            <th className="py-1.5 pr-2 font-semibold tabular-nums">Andel</th>
            <th className="py-1.5 pr-2 font-semibold tabular-nums">Mål</th>
            <th className="py-1.5 font-semibold tabular-nums">Avvik</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mål =
              r.targetPct != null
                ? fmtPct(r.targetPct)
                : showTargetCount && r.targetCount != null
                  ? String(r.targetCount)
                  : "—";
            const avvik =
              r.deltaPct != null
                ? `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct} %`
                : r.deltaCount != null
                  ? `${r.deltaCount > 0 ? "+" : ""}${r.deltaCount}`
                  : "—";
            const hot =
              (r.deltaPct != null && Math.abs(r.deltaPct) >= 8) ||
              (r.deltaCount != null && Math.abs(r.deltaCount) >= 3);
            return (
              <tr key={r.id} className="border-t border-slate-100 text-slate-800">
                <td className="py-1.5 pr-2 font-medium">{r.label}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.count}</td>
                <td className="py-1.5 pr-2 tabular-nums">{fmtPct(r.sharePct)}</td>
                <td className="py-1.5 pr-2 tabular-nums">{mål}</td>
                <td
                  className={`py-1.5 tabular-nums ${
                    hot ? "font-semibold text-amber-800" : ""
                  }`}
                >
                  {avvik}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {typeof value === "number" ? value.toLocaleString("no-NO") : value}
      </dd>
    </div>
  );
}

export function HuntReportPanel({
  report,
  compact,
}: {
  report: ProductHuntReport;
  compact?: boolean;
}) {
  const familyRows = compact
    ? report.families.filter((f) => f.count > 0).slice(0, 12)
    : report.families.filter((f) => f.count > 0 || (f.targetCount ?? 0) > 0).slice(0, 30);

  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        AI Product Hunt Report
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {report.summary}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Analysert" value={report.analyzed} />
        <Stat label="Godkjente kandidater" value={report.approvedCandidates} />
        <Stat label="Publiserte" value={report.published} />
        <Stat label="Forkastet" value={report.discarded} />
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kategori-fordeling
          </h4>
          <div className="mt-1">
            <ShareTable rows={report.categories} />
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Topp 10 familier
          </h4>
          <div className="mt-1">
            <ShareTable rows={report.top10Families} showTargetCount />
          </div>
        </div>
      </div>

      {!compact && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Produktfamilier
          </h4>
          <div className="mt-1">
            <ShareTable rows={familyRows} showTargetCount />
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Underrepresenterte
          </h4>
          <div className="mt-1">
            <ShareTable
              rows={report.underrepresented.slice(0, compact ? 6 : 12)}
              showTargetCount
            />
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Overrepresenterte
          </h4>
          <div className="mt-1">
            <ShareTable
              rows={report.overrepresented.slice(0, compact ? 6 : 10)}
              showTargetCount
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Gjennomsnitt (godkjent mix)
        </h4>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Margin" value={fmtPct(report.averages.marginPct)} />
          <Stat
            label="Profit"
            value={fmtNum(report.averages.profitNOK, " NOK")}
          />
          <Stat
            label="Leveringstid"
            value={fmtNum(report.averages.deliveryDays, " d")}
          />
          <Stat
            label="Landed Cost"
            value={fmtNum(report.averages.landedCostNOK, " NOK")}
          />
          <Stat
            label="Supplier Risk"
            value={fmtPct(report.averages.supplierRiskPct)}
          />
          <Stat
            label="Inventory Score"
            value={fmtNum(report.averages.inventoryScore)}
          />
          <Stat
            label="Demand Score"
            value={fmtNum(report.averages.demandScore)}
          />
          <Stat
            label="Økonomisk sikkerhet"
            value={fmtPct(report.averages.economicConfidence)}
          />
        </dl>
      </div>
    </div>
  );
}
