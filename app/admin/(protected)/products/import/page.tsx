"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Check, AlertCircle } from "lucide-react";

type Supplier = "Alibaba" | "eBay" | "Temu" | null;

interface ImportedProductPayload {
  name?: string;
  price?: number;
  suggestedPrice?: number;
  compareAtPrice?: number;
  description?: string;
  shortDescription?: string;
  category?: string;
  images?: string[];
  tags?: string[];
}

const DEFAULT_FORM = {
  name: "",
  price: 0,
  compareAtPrice: 0,
  description: "",
  shortDescription: "",
  category: "Elektronikk",
  images: "[]",
  tags: "[]",
  supplierPrice: 0,
};

export default function ImportProduct() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [productData, setProductData] = useState<ImportedProductPayload | null>(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const detectSupplier = (value: string): Supplier => {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (normalized.includes("alibaba.com")) return "Alibaba";
    if (normalized.includes("ebay.com") || normalized.includes("ebay.no")) return "eBay";
    if (normalized.includes("temu.com")) return "Temu";
    return null;
  };

  const supplierToEnum = (supplier: Supplier): "alibaba" | "ebay" | "temu" | null => {
    if (!supplier) return null;
    const normalized = supplier.toLowerCase();
    if (normalized === "alibaba") return "alibaba";
    if (normalized === "ebay") return "ebay";
    if (normalized === "temu") return "temu";
    return null;
  };

  const supplier = useMemo(() => detectSupplier(url), [url]);
  const profit = useMemo(() => {
    const diff = formData.price - formData.supplierPrice;
    if (!Number.isFinite(diff) || formData.supplierPrice === 0) {
      return { amount: 0, percentage: 0 };
    }
    return {
      amount: diff,
      percentage: (diff / formData.supplierPrice) * 100,
    };
  }, [formData.price, formData.supplierPrice]);

  const handleImport = async () => {
    setLoading(true);
    setError("");

    if (!url || !supplier) {
      setError("Ugyldig URL. Bruk Alibaba, eBay eller Temu.");
      setLoading(false);
      return;
    }

    try {
      console.log(`[Import] Scraping produkt fra ${supplier}: ${url}`);
      
      const response = await fetch("/api/admin/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }), // Supplier hentes automatisk fra URL
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorMsg = data.error || "Feil ved scraping";
        const hintMsg = data.hint || "";
        throw new Error(hintMsg ? `${errorMsg}\n\n${hintMsg}` : errorMsg);
      }

      console.log("[Import] Produkt scrapet:", data);

      setProductData(data);
      setFormData({
        name: data.name ?? "",
        price: data.suggestedPrice ?? 0,
        compareAtPrice: data.compareAtPrice ?? 0,
        description: data.description ?? "",
        shortDescription: data.shortDescription ?? "",
        category: data.category ?? "Elektronikk",
        images: JSON.stringify(data.images ?? []),
        tags: JSON.stringify(data.tags ?? []),
        supplierPrice: data.price ?? 0,
      });
    } catch (err) {
      console.error("[Import] Feil:", err);
      setError(err instanceof Error ? err.message : "Feil ved scraping");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");

    try {
      const supplierEnum = supplierToEnum(supplier);
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          supplierUrl: url,
          supplierName: supplierEnum,
          slug: formData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Feil ved lagring");
      }

      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved lagring");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setUrl("");
    setProductData(null);
    setFormData(DEFAULT_FORM);
    setError("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Importer Produkt</h1>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium">Produkt URL (Alibaba/eBay/Temu)</label>
          <div className="flex gap-2 max-sm:flex-col">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.alibaba.com/product-detail/..."
              className="flex-1 rounded-lg border border-border p-3 focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleImport}
              disabled={!url || loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-white transition hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Importerer...
                </>
              ) : (
                <>
                  <Download size={20} />
                  Importer
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-2 flex items-center gap-2 text-red-600">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        {productData && (
          <div className="space-y-4 border-t pt-6">
            <div className="mb-4 flex items-center gap-2 text-green-600">
              <Check size={20} />
              <span className="font-medium">Produkt hentet fra {supplier}</span>
            </div>

            {/* Vis bilder hvis de finnes */}
            {productData.images && productData.images.length > 0 && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">Scrapede Bilder ({productData.images.length})</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {JSON.parse(formData.images || "[]").slice(0, 8).map((img: string, idx: number) => (
                    <div key={idx} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                      <img
                        src={img}
                        alt={`Produktbilde ${idx + 1}`}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://placehold.co/300x300?text=Bilde+feilet";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Produktnavn (Norsk)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Kategori</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-3"
                >
                  <option>Elektronikk</option>
                  <option>Klær</option>
                  <option>Hjem</option>
                  <option>Sport</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Leverandørpris (NOK)</label>
                <input
                  type="number"
                  value={formData.supplierPrice}
                  onChange={(e) => setFormData({ ...formData, supplierPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-3"
                  readOnly
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Din Salgspris (NOK)</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-slate-300 p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Før-pris (NOK)</label>
                <input
                  type="number"
                  value={formData.compareAtPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, compareAtPrice: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-slate-300 p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Fortjeneste</label>
                <div className="rounded-lg border border-primary bg-primary/10 p-3 font-medium text-primary">
                  {profit.amount.toFixed(0)} kr ({profit.percentage.toFixed(0)}%)
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Kort Beskrivelse</label>
              <input
                type="text"
                value={formData.shortDescription}
                onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-3"
                maxLength={150}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Beskrivelse</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={6}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 rounded-lg bg-primary py-3 text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {loading ? "Lagrer..." : "Lagre Produkt"}
              </button>
              <button
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-6 py-3 hover:bg-slate-50"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

