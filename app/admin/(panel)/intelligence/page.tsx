import IntelligenceClient from "./IntelligenceClient";

export default function StoreIntelligencePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Butikkinnsikt
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Hva butikken trenger nå — hull i katalogen, risiko og neste steg. Du tar alltid siste beslutning.
        </p>
      </div>
      <IntelligenceClient />
    </div>
  );
}
