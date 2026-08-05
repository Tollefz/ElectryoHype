import {
  buildMemoryStars,
  formatStars,
  type MemoryStar,
} from "@/lib/ops/desk-memory-stars";
import type { StoreMemoryData } from "@/lib/autonomy/memory";

type Props = {
  memory: StoreMemoryData | null | undefined;
  stars?: MemoryStar[] | null;
};

export function DeskStoreMemory({ memory, stars }: Props) {
  const list =
    Array.isArray(stars) && stars.length
      ? stars
      : buildMemoryStars(memory);

  return (
    <section className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/50 via-white to-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">Store Memory</h2>
      <p className="text-sm text-slate-600">
        Slik lærer jeg hva du foretrekker — hver godkjenning og avvisning teller.
      </p>
      <p className="mt-3 text-sm font-medium text-slate-800">Robin foretrekker:</p>
      <ul className="mt-2 space-y-1.5">
        {list.map((s) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 text-sm ${
              s.kind === "dislike" ? "text-slate-500" : "text-slate-800"
            }`}
          >
            <span
              className={`font-medium tracking-tight ${
                s.kind === "dislike" ? "text-amber-700" : "text-emerald-700"
              }`}
              aria-label={`${s.stars} av 5`}
            >
              {formatStars(s.stars)}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
      {(memory?.brandProfile || memory?.imageStyle || memory?.seoStyle) && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {[memory?.brandProfile, memory?.imageStyle, memory?.seoStyle]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
