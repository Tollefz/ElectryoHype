"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AIHelperProps {
  type: "productDescription" | "seo";
  onResult: (result: any) => void;
  productData?: {
    name?: string;
    category?: string;
    price?: number;
    description?: string;
  };
}

export function AIHelper({ type, onResult, productData = {} }: AIHelperProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toneOfVoice, setToneOfVoice] = useState<"nøytral" | "entusiastisk" | "teknisk">("nøytral");
  const [useCase, setUseCase] = useState("");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          payload: {
            name: productData.name,
            category: productData.category,
            price: productData.price,
            toneOfVoice,
            useCase: useCase || undefined,
            description: productData.description,
          },
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Kunne ikke generere innhold");
      }

      setResult(data.result);
      onResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (type === "productDescription") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">AI-hjelper: Produktbeskrivelse</h3>
        </div>

        <div className="mb-3 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tone</label>
            <select
              value={toneOfVoice}
              onChange={(e) => setToneOfVoice(e.target.value as any)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="nøytral">Nøytral</option>
              <option value="entusiastisk">Entusiastisk</option>
              <option value="teknisk">Teknisk</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Bruksområde (valgfritt)
            </label>
            <input
              type="text"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              placeholder="F.eks. Hjemmekontor, Gaming, etc."
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={loading || !productData.name}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Genererer...
            </>
          ) : (
            <>
              <Sparkles size={16} className="mr-2" />
              Generer produktbeskrivelse
            </>
          )}
        </Button>

        {error && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            {result.description && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Beskrivelse</label>
                  <button
                    onClick={() => copyToClipboard(result.description)}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Kopiert!" : "Kopier"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={result.description}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                  rows={4}
                />
              </div>
            )}

            {result.bullets && result.bullets.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Nøkkelfordeler</label>
                  <button
                    onClick={() => copyToClipboard(result.bullets.join("\n"))}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Kopiert!" : "Kopier"}
                  </button>
                </div>
                <ul className="space-y-1 rounded border border-slate-300 bg-white p-2 text-sm">
                  {result.bullets.map((bullet: string, idx: number) => (
                    <li key={idx} className="list-disc list-inside">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (type === "seo") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">AI-hjelper: SEO</h3>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={loading || !productData.name}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Genererer...
            </>
          ) : (
            <>
              <Sparkles size={16} className="mr-2" />
              Generer SEO-tittel & meta-beskrivelse
            </>
          )}
        </Button>

        {error && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            {result.title && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">SEO-tittel</label>
                  <button
                    onClick={() => copyToClipboard(result.title)}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Kopiert!" : "Kopier"}
                  </button>
                </div>
                <input
                  readOnly
                  value={result.title}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {result.title.length} tegn (anbefalt: 50-60)
                </p>
              </div>
            )}

            {result.description && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Meta-beskrivelse</label>
                  <button
                    onClick={() => copyToClipboard(result.description)}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Kopiert!" : "Kopier"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={result.description}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                  rows={3}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {result.description.length} tegn (anbefalt: 140-160)
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

