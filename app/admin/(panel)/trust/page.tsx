import TrustClient from "./TrustClient";

export default function AiTrustPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          AI-tillit
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Se hva AI har lært av dine beslutninger — og hvor sikker den er.
        </p>
      </div>
      <TrustClient />
    </div>
  );
}
