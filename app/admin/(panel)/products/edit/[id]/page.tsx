"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Save, AlertCircle, Image as ImageIcon, X, ExternalLink, Download, Check, Plus, Trash2, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { AIHelper } from "@/components/admin/AIHelper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAllDbValues } from "@/lib/categories";

const STORE_CATEGORIES = getAllDbValues();

interface ProductVariant {
  id?: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  supplierPrice?: number;
  image?: string;
  attributes: Record<string, string>;
  stock: number;
  isActive: boolean;
}

/**
 * Safe numeric parsing: empty, missing or non-numeric values become 0.
 * Guarantees a finite number so NaN never reaches React inputs or math.
 */
const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const DEFAULT_FORM = {
  name: "",
  price: 0,
  compareAtPrice: 0,
  supplierPrice: 0,
  supplierUrl: "",
  supplierName: "",
  description: "",
  shortDescription: "",
  category: STORE_CATEGORIES[0] || "Hjem & Fritid",
  images: "[]",
  tags: "[]",
  isActive: true,
};

export default function EditProduct() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{
    images?: string[];
    price?: number;
    supplierPrice?: number;
    variants?: Array<{
      name: string;
      price: number;
      attributes: Record<string, string>;
      image?: string;
    }>;
  } | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(null);
  const [variantForm, setVariantForm] = useState<ProductVariant>({
    name: "",
    price: formData.price,
    compareAtPrice: formData.compareAtPrice,
    supplierPrice: formData.supplierPrice,
    image: "",
    attributes: {},
    stock: 10,
    isActive: true,
  });
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalType, setAiModalType] = useState<"productDescription" | "seo">("productDescription");

  const parseImagesFromString = (imagesStr: string): string[] => {
    if (!imagesStr) return [];
    try {
      const parsed = JSON.parse(imagesStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await fetch(`/api/admin/products/${productId}`);
        if (!response.ok) {
          throw new Error("Produkt ikke funnet");
        }

        const payload = await response.json();
        // API returns { ok, data }; unwrap the envelope
        const product = payload?.data ?? payload;

        const productImages =
          typeof product.images === "string" ? product.images : JSON.stringify(product.images ?? []);
        const parsedImages = parseImagesFromString(productImages);

        setFormData({
          name: product.name ?? "",
          price: toNumber(product.price),
          compareAtPrice: toNumber(product.compareAtPrice),
          supplierPrice: toNumber(product.supplierPrice),
          supplierUrl: product.supplierUrl ?? "",
          supplierName: product.supplierName ?? "",
          description: product.description ?? "",
          shortDescription: product.shortDescription ?? "",
          category: product.category ?? "Elektronikk",
          images: productImages,
          tags: typeof product.tags === "string" ? product.tags : JSON.stringify(product.tags ?? []),
          isActive: product.isActive ?? true,
        });
        setImages(parsedImages);
        
        // Hent varianter
        const variantsResponse = await fetch(`/api/admin/products/${productId}/variants`);
        if (variantsResponse.ok) {
          const variantsData = await variantsResponse.json();
          const safeVariants: ProductVariant[] = (variantsData.variants || []).map(
            (variant: ProductVariant) => ({
              ...variant,
              price: toNumber(variant.price),
              compareAtPrice:
                variant.compareAtPrice != null ? toNumber(variant.compareAtPrice) : undefined,
              supplierPrice:
                variant.supplierPrice != null ? toNumber(variant.supplierPrice) : undefined,
              stock: toNumber(variant.stock),
            })
          );
          setVariants(safeVariants);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Feil ved lasting av produkt");
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const handleAddImage = () => {
    if (newImageUrl.trim()) {
      const updatedImages = [...images, newImageUrl.trim()];
      setImages(updatedImages);
      setFormData({ ...formData, images: JSON.stringify(updatedImages) });
      setNewImageUrl("");
    }
  };

  const handleRemoveImage = (index: number) => {
    const updatedImages = images.filter((_, i) => i !== index);
    setImages(updatedImages);
    setFormData({ ...formData, images: JSON.stringify(updatedImages) });
  };

  const handleScrapeFromUrl = async () => {
    if (!formData.supplierUrl || !formData.supplierUrl.trim()) {
      setError("Leverandør URL er påkrevd for å hente bilder og priser");
      return;
    }

    setScraping(true);
    setError("");
    setScrapeResult(null);

    try {
      const response = await fetch("/api/admin/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formData.supplierUrl.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Kunne ikke hente produktdata");
      }

      const data = await response.json();
      
      // Sett scrapet data
      setScrapeResult({
        images: data.images || [],
        price: data.price || data.suggestedPrice,
        supplierPrice: data.price, // Leverandørpris
        variants: data.variants || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved henting av produktdata");
    } finally {
      setScraping(false);
    }
  };

  const handleUseScrapedPrice = () => {
    if (scrapeResult?.price) {
      setFormData({ ...formData, price: toNumber(scrapeResult.price) });
      if (scrapeResult.supplierPrice) {
        setFormData({
          ...formData,
          price: toNumber(scrapeResult.price),
          supplierPrice: toNumber(scrapeResult.supplierPrice),
        });
      }
    }
  };

  const handleUseScrapedImages = () => {
    if (scrapeResult?.images && scrapeResult.images.length > 0) {
      const updatedImages = [...images, ...scrapeResult.images];
      setImages(updatedImages);
      setFormData({ ...formData, images: JSON.stringify(updatedImages) });
      setScrapeResult(null); // Clear scrape result after using
    }
  };

  const handleAddScrapedImage = (imageUrl: string) => {
    if (!images.includes(imageUrl)) {
      const updatedImages = [...images, imageUrl];
      setImages(updatedImages);
      setFormData({ ...formData, images: JSON.stringify(updatedImages) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      // Oppdater produkt
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images: JSON.stringify(images),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Feil ved oppdatering");
      }

      // Oppdater varianter
      const variantsResponse = await fetch(`/api/admin/products/${productId}/variants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants }),
      });

      if (!variantsResponse.ok) {
        const data = await variantsResponse.json();
        throw new Error(data.error || "Feil ved oppdatering av varianter");
      }

      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved lagring");
    } finally {
      setSaving(false);
    }
  };

  const handleAddVariant = () => {
    if (!variantForm.name.trim()) {
      setError("Variantnavn er påkrevd");
      return;
    }

    if (editingVariantIndex !== null) {
      // Oppdater eksisterende variant
      const updatedVariants = [...variants];
      updatedVariants[editingVariantIndex] = { ...variantForm };
      setVariants(updatedVariants);
      setEditingVariantIndex(null);
    } else {
      // Legg til ny variant
      setVariants([...variants, { ...variantForm }]);
    }

    // Reset form
    setVariantForm({
      name: "",
      price: formData.price,
      compareAtPrice: formData.compareAtPrice,
      supplierPrice: formData.supplierPrice,
      image: "",
      attributes: {},
      stock: 10,
      isActive: true,
    });
    setShowVariantForm(false);
  };

  const handleEditVariant = (index: number) => {
    setVariantForm({ ...variants[index] });
    setEditingVariantIndex(index);
    setShowVariantForm(true);
  };

  const handleDeleteVariant = async (index: number) => {
    if (!confirm("Er du sikker på at du vil slette denne varianten?")) {
      return;
    }

    const variant = variants[index];
    if (variant.id) {
      // Slett fra backend
      try {
        const response = await fetch(`/api/admin/products/${productId}/variants/${variant.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Kunne ikke slette variant");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Feil ved sletting av variant");
        return;
      }
    }

    // Fjern fra liste
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleUseScrapedVariants = () => {
    if (scrapeResult?.variants && scrapeResult.variants.length > 0) {
      const newVariants: ProductVariant[] = scrapeResult.variants.map((v) => ({
        name: v.name,
        price: toNumber(v.price),
        compareAtPrice: formData.compareAtPrice,
        supplierPrice: formData.supplierPrice,
        image: v.image || images[0] || "",
        attributes: v.attributes || {},
        stock: 10,
        isActive: true,
      }));
      setVariants([...variants, ...newVariants]);
    }
  };

  const sellingPrice = toNumber(formData.price);
  const supplierPrice = toNumber(formData.supplierPrice);
  const profit = sellingPrice - supplierPrice;
  const profitPercentage = supplierPrice > 0 ? (profit / supplierPrice) * 100 : 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="text-sm text-gray-500">
            <Link href="/admin/products" className="hover:text-green-700">
              Produkter
            </Link>
            {" / "}
            <span className="text-gray-800">Rediger</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">Rediger produkt</h1>
          {formData.name ? (
            <p className="mt-1 text-sm text-gray-600 line-clamp-1">{formData.name}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(formData.supplierName || formData.supplierUrl) && (
            <Link
              href={`/admin/products/${productId}/supplier-raw`}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100"
            >
              Leverandørdata
            </Link>
          )}
          <Link
            href={`/admin/products/${productId}/edit-variants`}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100"
          >
            Variant-bilder
          </Link>
          {formData.supplierName ? (
            <Link
              href="/admin/suppliers/sync"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Synkronisering
            </Link>
          ) : null}
          <Link
            href="/admin/products"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Tilbake
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Produktnavn (Norsk)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 p-3"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Kategori</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full rounded-lg border border-slate-300 p-3"
            >
              {STORE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Leverandørpris (NOK)</label>
            <input
              type="number"
              value={formData.supplierPrice}
              onChange={(e) => setFormData({ ...formData, supplierPrice: toNumber(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Din Salgspris (NOK)</label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: toNumber(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 p-3"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Før-pris (NOK)</label>
            <input
              type="number"
              value={formData.compareAtPrice}
              onChange={(e) => setFormData({ ...formData, compareAtPrice: toNumber(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Fortjeneste</label>
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 font-medium text-green-700">
              {profit.toFixed(0)} kr ({profitPercentage.toFixed(0)}%)
            </div>
          </div>
        </div>

        {/* Leverandør informasjon */}
        <div className="mt-6 border-t pt-6">
          <h3 className="mb-4 text-lg font-semibold">Leverandør Informasjon</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Leverandør Navn</label>
              <input
                type="text"
                value={formData.supplierName}
                onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                placeholder="f.eks. Alibaba, Temu, eBay"
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Leverandør URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={formData.supplierUrl}
                  onChange={(e) => setFormData({ ...formData, supplierUrl: e.target.value })}
                  placeholder="https://www.temu.com/no/... eller https://www.alibaba.com/product-detail/..."
                  className="flex-1 rounded-lg border border-slate-300 p-3"
                />
                {formData.supplierUrl && (
                  <>
                    <button
                      type="button"
                      onClick={handleScrapeFromUrl}
                      disabled={scraping || !formData.supplierUrl.trim()}
                      className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-primary hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Hent bilder og priser fra URL"
                    >
                      {scraping ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Henter...
                        </>
                      ) : (
                        <>
                          <Download size={18} />
                          Hent data
                        </>
                      )}
                    </button>
                    <a
                      href={formData.supplierUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-3 text-primary hover:bg-slate-50"
                      title="Åpne i ny fane"
                    >
                      <ExternalLink size={20} />
                    </a>
                  </>
                )}
              </div>
              {formData.supplierUrl && (
                <p className="mt-1 text-xs text-slate-500">
                  {formData.supplierUrl.length > 60 
                    ? formData.supplierUrl.substring(0, 60) + "..." 
                    : formData.supplierUrl}
                </p>
              )}
              
              {/* Vis scrapet data */}
              {scrapeResult && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold text-green-800">📥 Data hentet fra URL</h4>
                    <button
                      type="button"
                      onClick={() => setScrapeResult(null)}
                      className="text-green-600 hover:text-green-800"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  
                  {/* Pris */}
                  {scrapeResult.price && (
                    <div className="mb-3 flex items-center justify-between rounded-lg bg-white p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Pris funnet</p>
                        <p className="text-lg font-bold text-green-700">
                          {scrapeResult.price.toFixed(0)} kr
                          {scrapeResult.supplierPrice && scrapeResult.supplierPrice !== scrapeResult.price && (
                            <span className="ml-2 text-sm text-gray-500">
                              (Leverandør: {scrapeResult.supplierPrice.toFixed(0)} kr)
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleUseScrapedPrice}
                        className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        <Check size={16} />
                        Bruk pris
                      </button>
                    </div>
                  )}
                  
                  {/* Bilder */}
                  {scrapeResult.images && scrapeResult.images.length > 0 ? (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700">
                          {scrapeResult.images.length} bilde(r) funnet
                        </p>
                        <button
                          type="button"
                          onClick={handleUseScrapedImages}
                          className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <Check size={14} />
                          Legg til alle
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {scrapeResult.images.map((imgUrl, idx) => (
                          <div key={idx} className="group relative">
                            <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                              <Image
                                src={imgUrl}
                                alt={`Scrapet bilde ${idx + 1}`}
                                fill
                                className="object-cover"
                                unoptimized
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = "https://placehold.co/200x200?text=Feil+bilde";
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddScrapedImage(imgUrl)}
                              className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <Check size={24} className="text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                      <AlertCircle size={16} className="mr-2 inline" />
                      Ingen bilder funnet. Du kan legge til bilder manuelt nedenfor.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t pt-6">
          <label className="mb-4 block text-sm font-medium">Produktbilder</label>

          {/* Eksisterende bilder */}
          {images.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {images.map((imageUrl, index) => {
                // Sjekk om URLen ser ut som et faktisk bilde (har bildeendelse eller er fra kjente CDNer)
                const isImageUrl =
                  imageUrl &&
                  typeof imageUrl === "string" &&
                  (imageUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i) ||
                    imageUrl.includes("alicdn.com") ||
                    imageUrl.includes("ebayimg.com") ||
                    imageUrl.includes("temu.com") ||
                    imageUrl.includes("placehold.co"));

                const displayUrl = isImageUrl ? imageUrl : "https://placehold.co/600x600?text=Ingen+bilde";

                return (
                  <div key={index} className="group relative">
                    <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
                      {isImageUrl ? (
                        <Image
                          src={displayUrl}
                          alt={`Produktbilde ${index + 1}`}
                          fill
                          className="object-cover"
                          unoptimized
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "https://placehold.co/600x600?text=Ingen+bilde";
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          Ikke et bilde
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legg til nytt bilde */}
          <div className="flex gap-2">
            <input
              type="url"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddImage();
                }
              }}
              placeholder="https://example.com/bilde.jpg (eller .png, .webp, osv.)"
              className="flex-1 rounded-lg border border-slate-300 p-3"
            />
            <button
              type="button"
              onClick={handleAddImage}
              disabled={!newImageUrl.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-white transition hover:bg-primary-dark disabled:opacity-50"
            >
              <ImageIcon size={20} />
              Legg til bilde
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Lim inn bildelenke (URL) - må ende med .jpg, .png, .webp, osv. eller være fra Alibaba/eBay/Temu CDN
          </p>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Status</label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>Aktivt produkt</span>
          </label>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Kort Beskrivelse</label>
          <input
            type="text"
            value={formData.shortDescription}
            onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
            className="w-full rounded-lg border border-slate-300 p-3"
            maxLength={150}
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium">Beskrivelse</label>
            <Dialog open={aiModalOpen && aiModalType === "productDescription"} onOpenChange={setAiModalOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAiModalType("productDescription");
                    setAiModalOpen(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  Generer med AI
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Generer produktbeskrivelse med AI</DialogTitle>
                  <DialogDescription>
                    AI-en vil generere en profesjonell produktbeskrivelse basert på produktnavn, kategori og pris.
                  </DialogDescription>
                </DialogHeader>
                <AIHelper
                  type="productDescription"
                  onResult={(result) => {
                    if (result.description) {
                      setFormData({ ...formData, description: result.description });
                      setAiModalOpen(false);
                    }
                  }}
                  productData={{
                    name: formData.name,
                    category: formData.category,
                    price: formData.price,
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-slate-300 p-3"
          />
        </div>

        <div className="mt-6 border-t pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">SEO (Søkemotoroptimalisering)</h3>
            <Dialog open={aiModalOpen && aiModalType === "seo"} onOpenChange={(open) => {
              if (!open) setAiModalOpen(false);
            }}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAiModalType("seo");
                    setAiModalOpen(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  Generer SEO med AI
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Generer SEO-tittel og beskrivelse med AI</DialogTitle>
                  <DialogDescription>
                    AI-en vil generere optimal SEO-tittel og meta-beskrivelse for søkemotorer.
                  </DialogDescription>
                </DialogHeader>
                <AIHelper
                  type="seo"
                  onResult={(result) => {
                    console.log("SEO result:", result);
                  }}
                  productData={{
                    name: formData.name,
                    category: formData.category,
                    description: formData.description || formData.shortDescription,
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            SEO-felter kan legges til senere. Bruk AI-helper for å generere optimalt innhold.
          </p>
        </div>

        {/* Produktvarianter */}
        <div className="mt-6 border-t pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Produktvarianter</h3>
            <button
              type="button"
              onClick={() => {
                setShowVariantForm(!showVariantForm);
                setEditingVariantIndex(null);
                setVariantForm({
                  name: "",
                  price: formData.price,
                  compareAtPrice: formData.compareAtPrice,
                  supplierPrice: formData.supplierPrice,
                  image: "",
                  attributes: {},
                  stock: 10,
                  isActive: true,
                });
              }}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              <Plus size={18} />
              Legg til variant
            </button>
          </div>

          {/* Vis scrapet varianter */}
          {scrapeResult?.variants && scrapeResult.variants.length > 0 && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {scrapeResult.variants.length} variant(er) funnet fra URL
                </p>
                <button
                  type="button"
                  onClick={handleUseScrapedVariants}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  <Check size={14} />
                  Legg til alle varianter
                </button>
              </div>
              <div className="space-y-2">
                {scrapeResult.variants.slice(0, 3).map((v, idx) => (
                  <div key={idx} className="rounded-lg bg-white p-2 text-sm">
                    <span className="font-medium">{v.name}</span>
                    {" - "}
                    <span className="text-gray-600">{v.price.toFixed(0)} kr</span>
                    {Object.keys(v.attributes).length > 0 && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({Object.entries(v.attributes).map(([k, v]) => `${k}: ${v}`).join(", ")})
                      </span>
                    )}
                  </div>
                ))}
                {scrapeResult.variants.length > 3 && (
                  <p className="text-xs text-gray-600">... og {scrapeResult.variants.length - 3} flere</p>
                )}
              </div>
            </div>
          )}

          {/* Variant form */}
          {showVariantForm && (
            <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
              <h4 className="mb-3 font-semibold">
                {editingVariantIndex !== null ? "Rediger variant" : "Ny variant"}
              </h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Navn *</label>
                  <input
                    type="text"
                    value={variantForm.name}
                    onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                    placeholder="f.eks. Rød - 2m, Large - Blå"
                    className="w-full rounded-lg border border-slate-300 p-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Pris (NOK)</label>
                  <input
                    type="number"
                    value={variantForm.price}
                    onChange={(e) => setVariantForm({ ...variantForm, price: toNumber(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 p-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Før-pris (NOK)</label>
                  <input
                    type="number"
                    value={variantForm.compareAtPrice || ""}
                    onChange={(e) =>
                      setVariantForm({
                        ...variantForm,
                        compareAtPrice: e.target.value === "" ? undefined : toNumber(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Lager</label>
                  <input
                    type="number"
                    value={variantForm.stock}
                    onChange={(e) => setVariantForm({ ...variantForm, stock: Math.trunc(toNumber(e.target.value)) })}
                    className="w-full rounded-lg border border-slate-300 p-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium">Bilde URL (valgfritt)</label>
                  <input
                    type="url"
                    value={variantForm.image || ""}
                    onChange={(e) => setVariantForm({ ...variantForm, image: e.target.value })}
                    placeholder="https://example.com/bilde.jpg"
                    className="w-full rounded-lg border border-slate-300 p-2"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                >
                  {editingVariantIndex !== null ? "Oppdater" : "Legg til"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVariantForm(false);
                    setEditingVariantIndex(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {/* Eksisterende varianter */}
          {variants.length > 0 ? (
            <div className="space-y-2">
              {variants.map((variant, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-slate-300 bg-white p-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      {variant.image && (
                        <div className="relative h-12 w-12 overflow-hidden rounded border">
                          <Image
                            src={variant.image}
                            alt={variant.name}
                            fill
                            className="object-cover"
                            unoptimized
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "https://placehold.co/48x48?text=Ingen";
                            }}
                          />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{variant.name}</p>
                        <p className="text-sm text-gray-600">
                          {variant.price.toFixed(0)} kr
                          {variant.compareAtPrice && variant.compareAtPrice > variant.price && (
                            <span className="ml-2 line-through text-gray-400">
                              {variant.compareAtPrice.toFixed(0)} kr
                            </span>
                          )}
                          {" · "}
                          Lager: {variant.stock}
                          {Object.keys(variant.attributes).length > 0 && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({Object.entries(variant.attributes).map(([k, v]) => `${k}: ${v}`).join(", ")})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditVariant(index)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVariant(index)}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Ingen varianter lagt til ennå. Klikk på &quot;Legg til variant&quot; for å legge til.</p>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Lagrer...
              </>
            ) : (
              <>
                <Save size={20} />
                Lagre endringer
              </>
            )}
          </button>
          <Link
            href="/admin/products"
            className="rounded-lg border border-slate-300 px-6 py-3 hover:bg-slate-50"
          >
            Avbryt
          </Link>
        </div>
      </div>
    </div>
  );
}

