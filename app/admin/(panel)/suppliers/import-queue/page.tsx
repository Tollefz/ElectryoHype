import { Suspense } from "react";
import ImportQueueClient from "./ImportQueueClient";

export default function ImportQueuePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Importkø</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hjertet i Supplier Engine — review, godkjenn og publiser herfra.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-slate-500">Laster kø…</div>}>
        <ImportQueueClient />
      </Suspense>
    </div>
  );
}
