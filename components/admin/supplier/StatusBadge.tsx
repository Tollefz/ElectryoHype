"use client";

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-800",
  validating: "bg-blue-100 text-blue-800",
  normalizing: "bg-blue-100 text-blue-800",
  enriching: "bg-indigo-100 text-indigo-800",
  quality_check: "bg-violet-100 text-violet-800",
  preview: "bg-cyan-100 text-cyan-800",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  published: "bg-green-600 text-white",
  failed: "bg-red-100 text-red-800",
  active: "bg-emerald-100 text-emerald-800",
  coming: "bg-slate-100 text-slate-600",
  legacy: "bg-amber-100 text-amber-900",
  ok: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
};

const LABELS: Record<string, string> = {
  queued: "I kø",
  processing: "Behandles",
  validating: "Validerer",
  normalizing: "Normaliserer",
  enriching: "AI",
  quality_check: "Kvalitet",
  preview: "Preview",
  review: "Review",
  approved: "Godkjent",
  published: "Publisert",
  failed: "Feilet",
  active: "Aktiv",
  coming: "Kommer",
  legacy: "Legacy",
  ok: "OK",
  error: "Feil",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const style = STATUS_STYLES[status] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {label || LABELS[status] || status}
    </span>
  );
}

export function ScoreBar({ score, size = "md" }: { score: number; size?: "sm" | "md" }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 99 ? "bg-emerald-500" : clamped >= 95 ? "bg-lime-500" : clamped >= 80 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={`w-full ${size === "sm" ? "max-w-[80px]" : "max-w-[120px]"}`}>
      <div className="mb-0.5 flex justify-between text-[10px] font-medium text-slate-600">
        <span>Score</span>
        <span>{clamped}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
