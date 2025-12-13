"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, AlertCircle, Image as ImageIcon, X, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { DEFAULT_STORE_ID } from "@/lib/store";
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
// Toast not available, using simple alert instead

const DEFAULT_FORM = {
  name: "",
  price: 0,
  compareAtPrice: 0,
  supplierPrice: 0,
  supplierUrl: "",
  supplierName: "",
  description: "",
  shortDescription: "",
  category: "Data & IT",
  images: "[]",
  tags: "[]",
  storeId: DEFAULT_STORE_ID,
  isActive: true,
};

const CATEGORIES = [
  "Data & IT",
  "Gaming",
  "Mobil & Tilbehør",
  "TV & Lyd",
  "Hvitevarer",
  "Smart Home",
  "Elektronikk",
];

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalType, setAiModalType] = useState<"productDescription" | "seo">("productDescription");

  const handleAddImage = () => {
    if (newImageUrl.trim()) {
      const updatedImages = [...images, newImageUrl.trim()];
      setImages(updatedImages);
      setFormData({ ...formData, images: JSON.stringify(updatedImages) });
      setNewImageUrl("");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Filen må være et bilde (jpg, png, webp, etc.)");
      return;
    }

    // Validate file size (max 4MB)
    if (file.size > 4 * 1024 * 1024) {
      setError("Bildet må være mindre enn 4MB");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke laste opp bilde");
      }

      // Add uploaded image URL to images array
      const updatedImages = [...images, data.url];
      setImages(updatedImages);
      setFormData((prev) => ({ ...prev, images: JSON.stringify(updatedImages) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved opplasting av bilde");
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    const updatedImages = images.filter((_, i) => i !== index);
    setImages(updatedImages);
    setFormData({ ...formData, images: JSON.stringify(updatedImages) });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    // Validering
    if (!formData.name.trim()) {
      setError("Produktnavn er påkrevd");
      setSaving(false);
      return;
    }

    if (!formData.price || formData.price <= 0) {
      setError("Pris må være større enn 0");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images: JSON.stringify(images),
          tags: typeof formData.tags === "string" ? formData.tags : JSON.stringify(formData.tags),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Feil ved oppretting av produkt");
      }

      alert("Produkt opprettet!");
      router.push("/admin/products");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Feil ved lagring";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const profit = formData.price - formData.supplierPrice;
  const profitPercentage = formData.supplierPrice > 0 ? (profit / formData.supplierPrice) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Nytt Produkt</h1>
        <Link
          href="/admin/products"
          className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
        >
          Avbryt
        </Link>
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
            <label className="mb-1 block text-sm font-medium">Produktnavn (Norsk) *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 p-3"
              required
              placeholder="f.eks. Gaming-tastatur RGB"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Kategori *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full rounded-lg border border-slate-300 p-3"
            >
              {CATEGORIES.map((cat) => (
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
              step="0.01"
              value={formData.supplierPrice}
              onChange={(e) => setFormData({ ...formData, supplierPrice: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Din Salgspris (NOK) *</label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-300 p-3"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Før-pris (NOK)</label>
            <input
              type="number"
              step="0.01"
              value={formData.compareAtPrice}
              onChange={(e) => setFormData({ ...formData, compareAtPrice: parseFloat(e.target.value) || 0 })}
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

        <div className="mt-6 border-t pt-6">
          <label className="mb-4 block text-sm font-medium">Produktbilder</label>

          {images.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {images.map((imageUrl, index) => {
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

          <div className="space-y-2">
            {/* File upload */}
            <div className="flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 hover:bg-slate-50">
                <ImageIcon size={20} />
                <span className="text-sm font-medium">
                  {uploading ? "Laster opp..." : "Last opp bilde"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {/* URL input */}
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
                placeholder="eller lim inn bildelenke (URL)"
                className="flex-1 rounded-lg border border-slate-300 p-3"
              />
              <button
                type="button"
                onClick={handleAddImage}
                disabled={!newImageUrl.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                <ImageIcon size={20} />
                Legg til URL
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Last opp bilde (max 4MB) eller lim inn bildelenke (URL)
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Kort Beskrivelse</label>
          <input
            type="text"
            value={formData.shortDescription}
            onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
            className="w-full rounded-lg border border-slate-300 p-3"
            maxLength={150}
            placeholder="Kort beskrivelse som vises i produktliste"
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
            placeholder="Detaljert produktbeskrivelse"
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
                    // Note: These fields might not exist in formData yet
                    // For now, we'll show them in the modal and user can copy
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

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Oppretter...
              </>
            ) : (
              <>
                <Save size={20} />
                Opprett produkt
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

