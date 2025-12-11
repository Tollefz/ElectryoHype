"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { callAdminAI, type AIType } from "@/lib/admin-ai";

type Mode = "productDescription" | "seo" | "categoryCopy" | "heroCopy" | "emailTemplate";

const MODES: { id: Mode; label: string }[] = [
  { id: "productDescription", label: "Produktbeskrivelse" },
  { id: "seo", label: "SEO" },
  { id: "categoryCopy", label: "Kategoritekst" },
  { id: "heroCopy", label: "Hero-tekst" },
  { id: "emailTemplate", label: "E-postmal" },
];

export function GlobalAIAssistant() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("productDescription");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form states
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload: any = {};

      // Build payload based on mode
      switch (mode) {
        case "productDescription":
          payload.name = formData.name || "";
          payload.category = formData.category || "";
          payload.price = formData.price ? Number(formData.price) : undefined;
          payload.tone = formData.tone || "nøytral";
          payload.notes = formData.notes || "";
          break;
        case "seo":
          payload.name = formData.name || "";
          payload.category = formData.category || "";
          payload.shortDescription = formData.shortDescription || "";
          payload.pageType = formData.pageType || "product";
          break;
        case "categoryCopy":
          payload.categoryName = formData.categoryName || "";
          payload.productsHint = formData.productsHint || "";
          payload.tone = formData.tone || "nøytral";
          break;
        case "heroCopy":
          payload.campaignName = formData.campaignName || "";
          payload.focus = formData.focus || "";
          payload.discountInfo = formData.discountInfo || "";
          break;
        case "emailTemplate":
          payload.templateType = formData.templateType || "campaign";
          payload.audienceDescription = formData.audienceDescription || "";
          payload.offerDescription = formData.offerDescription || "";
          break;
      }

      const response = await callAdminAI(mode, payload);

      if (!response.ok) {
        throw new Error(response.error || "Kunne ikke generere innhold");
      }

      setResult(response.result);
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

  const resetForm = () => {
    setFormData({});
    setResult(null);
    setError(null);
  };

  return (
    <>
      {/* Floating button - bottom right for all screens */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-green-700 transition-colors"
      >
        <Sparkles size={18} />
        AI Assistent
      </button>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-50">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">AI Assistent</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Få hjelp til tekst, SEO og kampanjer med noen få klikk.
            </DialogDescription>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  resetForm();
                }}
                className={`inline-flex rounded-full border px-3 py-1 text-xs sm:text-sm transition-colors ${
                  mode === m.id
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Form based on mode */}
          <div className="space-y-4">
            {mode === "productDescription" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Produktnavn *
                  </label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="F.eks. Gaming-tastatur RGB"
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Kategori
                  </label>
                  <Input
                    value={formData.category || ""}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="F.eks. Gaming"
                    className="bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Pris (kr)
                    </label>
                    <Input
                      type="number"
                      value={formData.price || ""}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="999"
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Tone
                    </label>
                    <select
                      value={formData.tone || "nøytral"}
                      onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="nøytral">Nøytral</option>
                      <option value="entusiastisk">Entusiastisk</option>
                      <option value="teknisk">Teknisk</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Stikkord (valgfritt)
                  </label>
                  <Textarea
                    value={formData.notes || ""}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="F.eks. Hjemmekontor, Gaming, RGB-lys"
                    rows={2}
                    className="bg-white"
                  />
                </div>
              </>
            )}

            {mode === "seo" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Side/Produktnavn *
                  </label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="F.eks. Gaming-tastatur RGB"
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Kort beskrivelse
                  </label>
                  <Textarea
                    value={formData.shortDescription || ""}
                    onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                    placeholder="Kort beskrivelse av produktet/siden"
                    rows={2}
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Type side
                  </label>
                  <select
                    value={formData.pageType || "product"}
                    onChange={(e) => setFormData({ ...formData, pageType: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="product">Produktside</option>
                    <option value="category">Kategoriside</option>
                    <option value="frontpage">Forside</option>
                    <option value="other">Annet</option>
                  </select>
                </div>
              </>
            )}

            {mode === "categoryCopy" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Kategorinavn *
                  </label>
                  <Input
                    value={formData.categoryName || ""}
                    onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })}
                    placeholder="F.eks. Gaming"
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Hva slags produkter? (valgfritt)
                  </label>
                  <Textarea
                    value={formData.productsHint || ""}
                    onChange={(e) => setFormData({ ...formData, productsHint: e.target.value })}
                    placeholder="F.eks. Tastaturer, mus, headset, gaming-stoler"
                    rows={3}
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tone
                  </label>
                  <select
                    value={formData.tone || "nøytral"}
                    onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="nøytral">Nøytral</option>
                    <option value="entusiastisk">Entusiastisk</option>
                    <option value="teknisk">Teknisk</option>
                  </select>
                </div>
              </>
            )}

            {mode === "heroCopy" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Kampanjenavn *
                  </label>
                  <Input
                    value={formData.campaignName || ""}
                    onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                    placeholder="F.eks. Black Week, Ukens tilbud"
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fokus (valgfritt)
                  </label>
                  <Input
                    value={formData.focus || ""}
                    onChange={(e) => setFormData({ ...formData, focus: e.target.value })}
                    placeholder="F.eks. Gaming, Elektronikk, Hjem"
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Rabattinfo (valgfritt)
                  </label>
                  <Input
                    value={formData.discountInfo || ""}
                    onChange={(e) => setFormData({ ...formData, discountInfo: e.target.value })}
                    placeholder="F.eks. Opptil 40% rabatt"
                    className="bg-white"
                  />
                </div>
              </>
            )}

            {mode === "emailTemplate" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Type mal *
                  </label>
                  <select
                    value={formData.templateType || "campaign"}
                    onChange={(e) => setFormData({ ...formData, templateType: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="welcome">Velkomst-e-post</option>
                    <option value="campaign">Kampanje-e-post</option>
                    <option value="newsletter">Nyhetsbrev</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Målgruppe (valgfritt)
                  </label>
                  <Input
                    value={formData.audienceDescription || ""}
                    onChange={(e) => setFormData({ ...formData, audienceDescription: e.target.value })}
                    placeholder="F.eks. Nye kunder, Gaming-entusiaster"
                    className="bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tilbud / Tema (valgfritt)
                  </label>
                  <Textarea
                    value={formData.offerDescription || ""}
                    onChange={(e) => setFormData({ ...formData, offerDescription: e.target.value })}
                    placeholder="F.eks. 20% rabatt på alle gaming-produkter"
                    rows={2}
                    className="bg-white"
                  />
                </div>
              </>
            )}

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={loading || (mode === "productDescription" && !formData.name) || (mode === "seo" && !formData.name) || (mode === "categoryCopy" && !formData.categoryName) || (mode === "heroCopy" && !formData.campaignName)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-full px-4 py-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Genererer...
                </>
              ) : (
                <>
                  <Sparkles size={16} className="mr-2" />
                  Generer {MODES.find((m) => m.id === mode)?.label.toLowerCase()}
                </>
              )}
            </Button>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
                {mode === "productDescription" && (
                  <>
                    {result.description && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Beskrivelse</label>
                          <button
                            onClick={() => copyToClipboard(result.description)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.description}
                          onChange={(e) => setResult({ ...result, description: e.target.value })}
                          rows={6}
                          className="bg-white"
                        />
                      </div>
                    )}
                    {result.bullets && result.bullets.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Nøkkelfordeler</label>
                          <button
                            onClick={() => copyToClipboard(result.bullets.join("\n"))}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <ul className="space-y-1 rounded-lg border border-slate-300 bg-white p-3 text-sm">
                          {result.bullets.map((bullet: string, idx: number) => (
                            <li key={idx} className="list-disc list-inside">
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {mode === "seo" && (
                  <>
                    {result.title && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">SEO-tittel</label>
                          <button
                            onClick={() => copyToClipboard(result.title)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Input
                          value={result.title}
                          onChange={(e) => setResult({ ...result, title: e.target.value })}
                          className="bg-white"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          {result.title.length} tegn (anbefalt: 50-60)
                        </p>
                      </div>
                    )}
                    {result.description && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Meta-beskrivelse</label>
                          <button
                            onClick={() => copyToClipboard(result.description)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.description}
                          onChange={(e) => setResult({ ...result, description: e.target.value })}
                          rows={3}
                          className="bg-white"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          {result.description.length} tegn (anbefalt: 140-160)
                        </p>
                      </div>
                    )}
                  </>
                )}

                {mode === "categoryCopy" && (
                  <>
                    {result.intro && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Introduksjon</label>
                          <button
                            onClick={() => copyToClipboard(result.intro)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.intro}
                          onChange={(e) => setResult({ ...result, intro: e.target.value })}
                          rows={4}
                          className="bg-white"
                        />
                      </div>
                    )}
                    {result.shortBlurb && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Kort blurb</label>
                          <button
                            onClick={() => copyToClipboard(result.shortBlurb)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.shortBlurb}
                          onChange={(e) => setResult({ ...result, shortBlurb: e.target.value })}
                          rows={2}
                          className="bg-white"
                        />
                      </div>
                    )}
                  </>
                )}

                {mode === "heroCopy" && (
                  <>
                    {result.headline && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Headline</label>
                          <button
                            onClick={() => copyToClipboard(result.headline)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Input
                          value={result.headline}
                          onChange={(e) => setResult({ ...result, headline: e.target.value })}
                          className="bg-white"
                        />
                      </div>
                    )}
                    {result.subheadline && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Subheadline</label>
                          <button
                            onClick={() => copyToClipboard(result.subheadline)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.subheadline}
                          onChange={(e) => setResult({ ...result, subheadline: e.target.value })}
                          rows={2}
                          className="bg-white"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {result.ctaPrimary && (
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700">Primær CTA</label>
                            <button
                              onClick={() => copyToClipboard(result.ctaPrimary)}
                              className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                            >
                              {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                          <Input
                            value={result.ctaPrimary}
                            onChange={(e) => setResult({ ...result, ctaPrimary: e.target.value })}
                            className="bg-white"
                          />
                        </div>
                      )}
                      {result.ctaSecondary && (
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700">Sekundær CTA</label>
                            <button
                              onClick={() => copyToClipboard(result.ctaSecondary)}
                              className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                            >
                              {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                          <Input
                            value={result.ctaSecondary}
                            onChange={(e) => setResult({ ...result, ctaSecondary: e.target.value })}
                            className="bg-white"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {mode === "emailTemplate" && (
                  <>
                    {result.subject && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Emnelinje</label>
                          <button
                            onClick={() => copyToClipboard(result.subject)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Input
                          value={result.subject}
                          onChange={(e) => setResult({ ...result, subject: e.target.value })}
                          className="bg-white"
                        />
                      </div>
                    )}
                    {result.preheader && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Preheader</label>
                          <button
                            onClick={() => copyToClipboard(result.preheader)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.preheader}
                          onChange={(e) => setResult({ ...result, preheader: e.target.value })}
                          rows={2}
                          className="bg-white"
                        />
                      </div>
                    )}
                    {result.bodyHtml && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">E-postinnhold (HTML)</label>
                          <button
                            onClick={() => copyToClipboard(result.bodyHtml)}
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200 transition-colors"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Kopiert!" : "Kopier"}
                          </button>
                        </div>
                        <Textarea
                          value={result.bodyHtml}
                          onChange={(e) => setResult({ ...result, bodyHtml: e.target.value })}
                          rows={10}
                          className="bg-white font-mono text-xs"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

