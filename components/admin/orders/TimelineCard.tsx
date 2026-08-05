import { OrderCard } from "./order-ui";

export type TimelineEvent = {
  id: string;
  title: string;
  at: string;
  source?: string;
};

type Props = {
  events: TimelineEvent[];
};

export function TimelineCard({ events }: Props) {
  return (
    <OrderCard title="Ordrehistorikk">
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen hendelser ennå.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white" />
              <p className="text-sm font-semibold text-slate-900">{e.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {e.at}
                {e.source ? ` · ${e.source}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </OrderCard>
  );
}
