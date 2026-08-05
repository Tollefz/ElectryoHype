import type { DeskFeedItem } from "@/lib/ops/desk-ai-feed";

const toneClass = {
  neutral: "text-slate-700",
  good: "text-emerald-800",
  wait: "text-amber-800",
  warn: "text-rose-800",
} as const;

export function DeskAiFeed({ items }: { items: DeskFeedItem[] | null | undefined }) {
  const list = Array.isArray(items) && items.length
    ? items
    : [
        {
          id: "empty",
          at: "",
          timeLabel: "—",
          text: "Når jeg jobber, dukker historien opp her — som en aktivitetslogg.",
          tone: "neutral" as const,
        },
      ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">AI-feed</h2>
      <p className="text-sm text-slate-600">
        Hva jeg gjorde — i rekkefølge. Ikke rådata.
      </p>
      <ol className="mt-4 space-y-0">
        {list.map((item, i) => (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < list.length - 1 && (
              <span
                className="absolute left-[1.65rem] top-6 bottom-0 w-px bg-slate-200"
                aria-hidden
              />
            )}
            <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-500">
              {item.timeLabel}
            </span>
            <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
              ↓
            </span>
            <p className={`pt-0.5 text-sm ${toneClass[item.tone] || toneClass.neutral}`}>
              {item.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
