"use client";

const STEPS = [
  { id: "search", label: "Søk" },
  { id: "import", label: "Importer" },
  { id: "queue", label: "Kø" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
  { id: "publish", label: "Publiser" },
] as const;

export type PipelineStep = (typeof STEPS)[number]["id"];

const STATUS_TO_STEP: Record<string, PipelineStep> = {
  queued: "queue",
  processing: "queue",
  validating: "queue",
  normalizing: "queue",
  enriching: "queue",
  quality_check: "queue",
  preview: "preview",
  ai: "queue",
  review: "review",
  approved: "review",
  published: "publish",
  failed: "queue",
};

export function PipelineStepper({
  current,
  status,
  compact,
}: {
  current?: PipelineStep;
  status?: string;
  compact?: boolean;
}) {
  const active = current || (status ? STATUS_TO_STEP[status] || "queue" : "search");
  const activeIdx = STEPS.findIndex((s) => s.id === active);

  return (
    <ol
      className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-2"}`}
      aria-label="Import-pipeline"
    >
      {STEPS.map((step, idx) => {
        const done = idx < activeIdx;
        const isCurrent = idx === activeIdx;
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isCurrent
                  ? "bg-emerald-600 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  isCurrent
                    ? "bg-white/20"
                    : done
                      ? "bg-emerald-200"
                      : "bg-slate-200"
                }`}
              >
                {idx + 1}
              </span>
              {step.label}
            </span>
            {idx < STEPS.length - 1 ? (
              <span className={`h-px ${compact ? "w-2" : "w-4"} bg-slate-200`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
