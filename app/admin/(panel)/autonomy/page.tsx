import AutonomyClient from "./AutonomyClient";

export default function AutonomyPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Autonomi
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          La AI ta rutinen til review. Du håndterer ordre, kunder og strategi.
        </p>
      </div>
      <AutonomyClient />
    </div>
  );
}
