"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { importProducts } from "./actions";

interface ImportResult {
  success: boolean;
  url: string;
  productName?: string;
  error?: string;
  images?: number;
  price?: number;
  variants?: number;
}

export default function BulkImportClient() {
  const router = useRouter();
  const [urls, setUrls] = useState<string>("");
  const [isPending, setIsPending] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);
    setResults([]);

    try {
      const result = await importProducts(formData);
      
      if (result.error) {
        setError(result.error);
        setIsPending(false);
        return;
      }

      const importResults = result.results || [];
      setResults(importResults);

      // Vis suksessmelding hvis noen produkter ble importert
      const successful = importResults.filter((r: ImportResult) => r.success);
      if (successful.length > 0) {
        setTimeout(() => {
          router.push("/admin/products");
        }, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukjent feil ved import");
    } finally {
      setIsPending(false);
    }
  }

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Bulk Import Produkter</h1>
          <p className="mt-2 text-secondary">
            Lim inn Temu URL-er (én per linje) for å importere produkter med beskrivelse, pris, bilder og varianter
          </p>
        </div>
        <Link
          href="/admin/products"
          className="rounded-lg border border-border px-4 py-2 text-primary hover:bg-surface transition-colors"
        >
          Tilbake
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-red/10 p-4 text-accent-red">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <form 
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          await handleSubmit(formData);
        }}
        className="rounded-xl bg-white p-6 shadow-sm"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="urls" className="mb-2 block text-sm font-medium text-primary">
              Temu URL-er (én per linje)
            </label>
            <textarea
              id="urls"
              name="urls"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={`https://www.temu.com/no/produkt-1.html
https://www.temu.com/no/produkt-2.html
https://www.temu.com/no/produkt-3.html`}
              rows={12}
              className="w-full rounded-lg border border-border p-4 font-mono text-sm text-primary focus:border-accent-green focus:outline-none focus:ring-1 focus:ring-accent-green"
              disabled={isPending}
              required
            />
            <p className="mt-2 text-xs text-secondary">
              💡 Lim inn alle URL-er du vil importere. Hvert produkt vil få:
              <br />
              • Beskrivelse • Pris (leverandør + salgspris) • Bilder • Varianter (farger/størrelser hvis tilgjengelig)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending || !urls.trim()}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Importerer produkter...
                </>
              ) : (
                <>
                  <Download size={20} />
                  Importer produkter
                </>
              )}
            </button>
            {urls.trim() && (
              <span className="text-sm text-secondary">
                {urls.split("\n").filter((url) => url.trim().startsWith("http")).length} URL(er) funnet
              </span>
            )}
          </div>
        </div>
      </form>

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-primary">Importresultater</h2>

          {/* Summary */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-accent-green/10 p-4 text-center">
              <div className="text-2xl font-bold text-accent-green">{successful.length}</div>
              <div className="text-sm text-secondary">Vellykket</div>
            </div>
            <div className="rounded-lg bg-accent-red/10 p-4 text-center">
              <div className="text-2xl font-bold text-accent-red">{failed.length}</div>
              <div className="text-sm text-secondary">Feilet</div>
            </div>
            <div className="rounded-lg bg-surface p-4 text-center">
              <div className="text-2xl font-bold text-primary">{results.length}</div>
              <div className="text-sm text-secondary">Totalt</div>
            </div>
          </div>

          {/* Results list */}
          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className={`rounded-lg border p-4 ${
                  result.success
                    ? "border-accent-green/20 bg-accent-green/5"
                    : "border-accent-red/20 bg-accent-red/5"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle className="text-accent-green" size={20} />
                      ) : (
                        <XCircle className="text-accent-red" size={20} />
                      )}
                      <div>
                        <p className="font-medium text-primary">
                          {result.productName || "Ukjent produkt"}
                        </p>
                        <p className="mt-1 text-xs text-secondary">
                          {result.url.length > 80 ? result.url.substring(0, 80) + "..." : result.url}
                        </p>
                      </div>
                    </div>
                    {result.success && (
                      <div className="ml-7 mt-2 flex gap-4 text-xs text-secondary">
                        {result.price && (
                          <span>
                            💰 Pris: {result.price} kr
                          </span>
                        )}
                        {result.images !== undefined && (
                          <span>
                            🖼️ Bilder: {result.images}
                          </span>
                        )}
                        {result.variants !== undefined && result.variants > 0 && (
                          <span>
                            🎨 Varianter: {result.variants}
                          </span>
                        )}
                      </div>
                    )}
                    {!result.success && result.error && (
                      <p className="ml-7 mt-1 text-sm text-accent-red">{result.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {successful.length > 0 && (
            <div className="mt-6 rounded-lg bg-accent-green/10 p-4 text-center text-accent-green">
              ✅ {successful.length} produkt(er) importert! Omdirigerer til produktsiden om 3 sekunder...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

