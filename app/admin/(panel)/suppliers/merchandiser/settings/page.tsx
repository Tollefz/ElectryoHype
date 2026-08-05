import MerchandiserSettingsClient from "./MerchandiserSettingsClient";

export default function MerchandiserSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Butikkprofil</h1>
        <p className="mt-1 text-sm text-slate-600">
          ElectroHypeX-profilen som AI Merchandiser bruker i scoring og prompts.
        </p>
      </div>
      <MerchandiserSettingsClient />
    </div>
  );
}
