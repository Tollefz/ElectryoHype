"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Save } from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";

const EXAMPLES = [
  "Prioriter produkter med levering under 10 dager.",
  "Jeg vil ha minimum ca. 35 % margin.",
  "Unngå produkter som ser billige ut.",
  "Gaming er en prioritert kategori.",
  "Ikke anbefal generiske mobilladere som Gaming.",
];

/**
 * Free-text store rules — signals for ranking, never destructive actions.
 */
export function BuyerPreferencesPanel() {
  const [text, setText] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/buyer?view=preferences");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      setText((data.rules as string[]).join("\n"));
      setUpdatedAt(data.updatedAt || "");
      setLikesCount(Number(data.likesCount || 0));
      setDislikesCount(Number(data.dislikesCount || 0));
    } catch (e: unknown) {
      toast.error(classifyAdminError(e).reason);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const rules = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_preference_rules",
          rules,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success(`Lagret ${rules.length} regler — påvirker ranking`);
      setUpdatedAt(data.updatedAt || "");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">
        Lær AI-en hvordan jeg driver butikken
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Skriv regler på vanlig norsk. De brukes som signaler i produkt-ranking
        sammen med 👍/👎 — aldri til å slette eller publisere automatisk.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={EXAMPLES.join("\n")}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-emerald-300"
                onClick={() =>
                  setText((t) => (t.trim() ? `${t.trim()}\n${ex}` : ex))
                }
              >
                + {ex.slice(0, 36)}…
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              👍 {likesCount} · 👎 {dislikesCount}
              {updatedAt
                ? ` · sist lagret ${new Date(updatedAt).toLocaleString("nb-NO")}`
                : ""}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Lagre preferanser
            </button>
          </div>
        </>
      )}
    </section>
  );
}
