"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";

type Profile = {
  name: string;
  audience: string;
  priceLevel: string;
  designStyle: string | null;
  productStrategy: string | null;
  categories: string[];
  qualityLevel: string;
  brandVoice: string | null;
  avoidCategories: string[];
  merchandiserSettings: {
    autoQueueEnabled: boolean;
    autoQueueMinScore: number;
    defaultBatchSize: 10 | 25 | 100;
    minScoreToShow: number;
    trendSignalsEnabled: boolean;
  };
};

export default function MerchandiserSettingsClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/merchandiser/profile");
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
        setProfile(data.profile);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Kunne ikke laste");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/merchandiser/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Lagring feilet");
      setProfile(data.profile);
      toast.success("Butikkprofil lagret");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" />
      </div>
    );
  }

  const s = profile.merchandiserSettings;

  return (
    <div className="space-y-5">
      <SupplierEngineTabs />
      <Link
        href="/admin/suppliers/merchandiser"
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700"
      >
        <ArrowLeft size={14} /> Tilbake til Merchandiser
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Butikkprofil</h2>
          <p className="text-sm text-slate-600">
            Brukes i AI-scoring og forklaringer. Leverandørdata er fortsatt sannheten.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Navn</span>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Målgruppe</span>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2"
              rows={3}
              value={profile.audience}
              onChange={(e) => setProfile({ ...profile, audience: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Prisnivå</span>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={profile.priceLevel}
              onChange={(e) => setProfile({ ...profile, priceLevel: e.target.value })}
            >
              <option value="budget">Budget</option>
              <option value="mid">Mid</option>
              <option value="premium">Premium</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Produktstrategi</span>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2"
              rows={3}
              value={profile.productStrategy || ""}
              onChange={(e) =>
                setProfile({ ...profile, productStrategy: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Design</span>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2"
              rows={2}
              value={profile.designStyle || ""}
              onChange={(e) => setProfile({ ...profile, designStyle: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Kategorier (kommaseparert)
            </span>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={profile.categories.join(", ")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  categories: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Unngå</span>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={(profile.avoidCategories || []).join(", ")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  avoidCategories: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Automatisering</h2>
          <p className="text-sm text-slate-600">
            Produkter over terskel kan legges i Import Queue / Review. Aldri auto-publisering.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.autoQueueEnabled}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  merchandiserSettings: {
                    ...s,
                    autoQueueEnabled: e.target.checked,
                  },
                })
              }
            />
            Legg produkter over score automatisk i Review-kø
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Auto-kø min. score ({s.autoQueueMinScore})
            </span>
            <input
              type="range"
              min={80}
              max={99}
              value={s.autoQueueMinScore}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  merchandiserSettings: {
                    ...s,
                    autoQueueMinScore: Number(e.target.value),
                  },
                })
              }
              className="mt-2 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Standard batch</span>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={s.defaultBatchSize}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  merchandiserSettings: {
                    ...s,
                    defaultBatchSize: Number(e.target.value) as 10 | 25 | 100,
                  },
                })
              }
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Min. score å vise ({s.minScoreToShow})
            </span>
            <input
              type="range"
              min={40}
              max={90}
              value={s.minScoreToShow}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  merchandiserSettings: {
                    ...s,
                    minScoreToShow: Number(e.target.value),
                  },
                })
              }
              className="mt-2 w-full"
            />
          </label>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
            Trend-signaler (Google Trends, salgshistorikk, sesong) er forberedt i
            arkitekturen, men ikke aktivert ennå.
          </div>
        </section>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Lagrer…" : "Lagre profil"}
      </button>
    </div>
  );
}
