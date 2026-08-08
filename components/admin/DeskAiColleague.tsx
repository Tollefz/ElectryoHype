import type { ColleagueBrief } from "@/lib/ops/ai-colleague-brief";

type Props = {
  brief: ColleagueBrief | null | undefined;
};

const urgencyStyle = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100",
  yellow: "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100",
  red: "border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100",
} as const;

const urgencyDot = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
} as const;

/**
 * Hero: AI colleague narrative — first thing on Rob's Desk.
 * Fully defensive: never throws on missing brief fields.
 */
export function DeskAiColleague({ brief }: Props) {
  const b = brief || {
    greeting: "Hei.",
    intro: "Jeg er klar.",
    did: ["Ingen brief ennå."],
    found: ["Ingen funn ennå."],
    recommends: ["Åpne Digital Buyer når du vil at jeg skal lete."],
    needsHelp: ["Ingen kritiske problemer."],
    closing: "Estimert arbeidstid: —",
    estimatedMinutes: 0,
    actions: [],
    storyParagraphs: [],
  };

  const did = Array.isArray(b.did) ? b.did : [];
  const found = Array.isArray(b.found) ? b.found : [];
  const needsHelp = Array.isArray(b.needsHelp) ? b.needsHelp : [];
  const actions = Array.isArray(b.actions) ? b.actions : [];

  const hasOpenWork =
    actions.length > 0 ||
    needsHelp.some((l) => !/ingen kritiske/i.test(l)) ||
    found.some((l) => /feilet|trenger deg|venter på/i.test(l));

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm sm:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl"
        aria-hidden
      />
      <div className="relative">
        <p className="text-4xl" aria-hidden>
          🤖
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {b.greeting || "Hei."}
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-600">
          {b.intro || "Jeg har allerede jobbet."}
        </p>

        <div className="mt-6 max-w-2xl space-y-3 text-base leading-relaxed text-slate-800">
          {did.map((line, i) => (
            <p key={`did-${i}`}>{line}</p>
          ))}
          {found.map((line, i) => (
            <p key={`found-${i}`}>{line}</p>
          ))}
          {needsHelp.map((line, i) => (
            <p key={`help-${i}`} className={i === 0 ? "pt-1 font-medium" : undefined}>
              {line}
            </p>
          ))}
          <p className="pt-2 text-sm font-semibold text-emerald-800">
            {b.closing || "Estimert arbeidstid: —"}
          </p>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Det du må gjøre
          </p>
          {!hasOpenWork ? (
            <p className="rounded-xl bg-emerald-100/80 px-4 py-3 text-sm font-semibold text-emerald-900">
              Tomt skrivebord — du kan lukke laptopen.
            </p>
          ) : actions.length === 0 ? (
            <p className="rounded-xl bg-amber-100/80 px-4 py-3 text-sm font-semibold text-amber-950">
              Det er åpne saker over — start med den høyeste prioriteten.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 sm:max-w-md">
              {actions.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.href || "#"}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                      urgencyStyle[a.urgency] || urgencyStyle.green
                    }`}
                  >
                    <span aria-hidden>{urgencyDot[a.urgency] || "🟢"}</span>
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
