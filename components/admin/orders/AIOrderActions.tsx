/**
 * Placeholder for future AI order actions — modular slot on order detail.
 */
import { OrderCard } from "./order-ui";

export function AIOrderActions({
  hint = "AI kan senere foreslå oppfyllelse, frakt og kundesvar her.",
}: {
  hint?: string;
}) {
  return (
    <OrderCard title="AI-handlinger">
      <p className="text-sm text-slate-500">{hint}</p>
      <p className="mt-2 text-xs text-slate-400">
        Komponent klar for fremtidig autonomi — ingen handlinger ennå.
      </p>
    </OrderCard>
  );
}
