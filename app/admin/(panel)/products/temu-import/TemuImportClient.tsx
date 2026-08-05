"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Upload, Check, AlertCircle, ExternalLink, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  isValidTemuUrl,
  isValidAlibabaUrl,
  isAlibabaProductUrl,
  normalizeUrl,
} from "@/lib/utils/url-validation";
import type { ImportEditableField } from "@/lib/import/types";
import { getEditedFieldLabels } from "@/lib/import/field-labels";
import { runQualityCheck } from "@/lib/import/quality-check";
import { BUYER_APPROVED_SCORE, BUYER_REVIEW_MIN_SCORE } from "@/lib/import/buyer-policy";
import toast from "react-hot-toast";
import {
  ProductImportPreview,
  type ProductImportData,
} from "@/components/admin/import/ProductImportPreview";

type ImportStage = "scraping" | "generating" | "pricing" | "seo" | "done";

const IMPORT_STAGE_LABELS: Record<ImportStage, string> = {
  scraping: "Skraper produktdata...",
  generating: "Genererer innhold med AI...",
  pricing: "Beregner priser...",
  seo: "Optimaliserer SEO...",
  done: "Fullført",
};

/** Client-side stage progression while the pipeline request runs. */
const IMPORT_STAGE_TIMINGS: Array<{ stage: ImportStage; afterMs: number }> = [
  { stage: "generating", afterMs: 4000 },
  { stage: "pricing", afterMs: 9000 },
  { stage: "seo", afterMs: 11000 },
];

interface ProductPreview {
  url: string;
  status: "pending" | "loading" | "success" | "error";
  stage?: ImportStage;
  data?: ProductImportData;
  editedFields?: Partial<Record<ImportEditableField, boolean>>;
  error?: string;
}

type Provider = "temu" | "alibaba";

const STORAGE_KEY_PREFIX = "bulk-import-urls";

function getStorageKey(provider: Provider): string {
  return `${STORAGE_KEY_PREFIX}-${provider}`;
}

function loadUrlsFromStorage(provider: Provider): string {
  if (typeof window === "undefined") return "";

  try {
    const stored = localStorage.getItem(getStorageKey(provider));
    return stored || "";
  } catch (error) {
    console.warn("[Bulk Import] Failed to load URLs from storage:", error);
    return "";
  }
}

function saveUrlsToStorage(provider: Provider, urls: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(getStorageKey(provider), urls);
  } catch (error) {
    console.warn("[Bulk Import] Failed to save URLs to storage:", error);
  }
}

function mapPipelineToImportData(pipeline: Record<string, unknown>): ProductImportData {
  return {
    name: String(pipeline.name || ""),
    originalName: String(pipeline.originalTitle || ""),
    description: String(pipeline.description || ""),
    originalDescription: String(pipeline.originalDescription || ""),
    price: Number(pipeline.originalPrice || 0),
    originalPrice: Number(pipeline.originalPrice || 0),
    suggestedPrice: Number(pipeline.suggestedPrice || 0),
    compareAtPrice: Number(pipeline.compareAtPrice || 0),
    shortDescription: String(pipeline.shortDescription || ""),
    images: Array.isArray(pipeline.images) ? (pipeline.images as string[]) : [],
    variants: Array.isArray(pipeline.variants)
      ? (pipeline.variants as ProductImportData["variants"])
      : undefined,
    category: String(pipeline.category || "Hjem & Fritid"),
    subcategory: typeof pipeline.subcategory === "string" ? pipeline.subcategory : null,
    tags: Array.isArray(pipeline.tags) ? (pipeline.tags as string[]) : [],
    slug: String(pipeline.slug || ""),
    metaTitle: String(pipeline.metaTitle || ""),
    metaDescription: String(pipeline.metaDescription || ""),
    deliveryTime: String(pipeline.deliveryTime || "5–12 virkedager"),
    specs: (pipeline.specs as Record<string, string>) || {},
    supplier: String(pipeline.supplier || "temu"),
    aiGenerated: Boolean(pipeline.aiGenerated),
    aiWarning: pipeline.aiWarning ? String(pipeline.aiWarning) : undefined,
    highlightedFeatures: Array.isArray(pipeline.highlightedFeatures)
      ? (pipeline.highlightedFeatures as string[])
      : undefined,
  };
}

export default function TemuImportClient() {
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<Provider>("temu");
  const [urls, setUrls] = useState("");
  const [products, setProducts] = useState<ProductPreview[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [improvingIndex, setImprovingIndex] = useState<number | null>(null);
  const [isLoadingFromStorage, setIsLoadingFromStorage] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    setIsLoadingFromStorage(true);
    const storedUrls = loadUrlsFromStorage(provider);
    setUrls(storedUrls);
    setProducts([]);
    setTimeout(() => setIsLoadingFromStorage(false), 100);
  }, [provider, mounted]);

  useEffect(() => {
    if (isLoadingFromStorage) return;
    if (!urls.trim()) return;

    const timeoutId = setTimeout(() => {
      saveUrlsToStorage(provider, urls);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [urls, provider, isLoadingFromStorage]);

  const validateUrl = (url: string, currentProvider: Provider): boolean => {
    if (currentProvider === "temu") {
      return isValidTemuUrl(url);
    }
    if (currentProvider === "alibaba") {
      return isValidAlibabaUrl(url);
    }
    return false;
  };

  const handleLoadUrls = () => {
    setIsLoadingFromStorage(true);
    const storedUrls = loadUrlsFromStorage(provider);
    if (!storedUrls.trim()) {
      const providerName = provider === "temu" ? "Temu" : "Alibaba";
      alert(`Ingen lagrede ${providerName}-URLs funnet.`);
      setIsLoadingFromStorage(false);
      return;
    }
    setUrls(storedUrls);
    setTimeout(() => setIsLoadingFromStorage(false), 100);
  };

  const handleParse = () => {
    const urlList = urls
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => {
        if (url.length === 0) return false;
        if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
        return validateUrl(url, provider);
      });

    if (provider === "alibaba") {
      const invalidUrls = urlList.filter((url) => !isAlibabaProductUrl(url));
      if (invalidUrls.length > 0 && urlList.length > 0) {
        console.warn(
          "Noen URLs ser ikke ut som produkt-URLs (mangler /product-detail/). Fortsetter likevel..."
        );
      }
    }

    const normalizedUrlList = urlList.map((url) => normalizeUrl(url));

    if (urlList.length === 0) {
      const providerName = provider === "temu" ? "Temu" : "Alibaba";
      alert(`Ingen gyldige ${providerName}-URLs funnet!`);
      return;
    }

    setProducts(
      normalizedUrlList.map((url) => ({
        url,
        status: "pending",
        editedFields: {},
      }))
    );

    saveUrlsToStorage(provider, normalizedUrlList.join("\n"));
  };

  const setProductStage = useCallback((index: number, stage: ImportStage) => {
    setProducts((prev) =>
      prev.map((p, idx) => (idx === index && p.status === "loading" ? { ...p, stage } : p))
    );
  }, []);

  const handleImportAll = async () => {
    setImporting(true);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      if (product.status === "success" || product.status === "loading") {
        continue;
      }

      setProducts((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "loading", stage: "scraping" } : p
        )
      );

      // Advance the visible stage while the single pipeline request runs
      const stageTimers = IMPORT_STAGE_TIMINGS.map(({ stage, afterMs }) =>
        setTimeout(() => setProductStage(i, stage), afterMs)
      );

      try {
        const response = await fetch("/api/admin/import/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: product.url, provider }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Feil ved import");
        }

        const pipelineData = await response.json();
        const formattedData = mapPipelineToImportData(pipelineData);

        setProducts((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: "success",
                  stage: "done",
                  data: formattedData,
                  editedFields: {},
                }
              : p
          )
        );

        if (i < products.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Ukjent feil";
        setProducts((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "error", stage: undefined, error: message } : p
          )
        );
      } finally {
        stageTimers.forEach(clearTimeout);
      }
    }

    setImporting(false);
  };

  const updateProductField = useCallback(
    (index: number, field: ImportEditableField, value: string | number | string[] | null) => {
      setProducts((prev) =>
        prev.map((product, idx) => {
          if (idx !== index || !product.data) return product;

          const nextData = { ...product.data };
          const nextEdited = { ...(product.editedFields || {}) };

          switch (field) {
            case "name":
              nextData.name = String(value);
              break;
            case "description":
              nextData.description = String(value);
              break;
            case "shortDescription":
              nextData.shortDescription = String(value);
              break;
            case "suggestedPrice":
              nextData.suggestedPrice = Number(value) || 0;
              break;
            case "compareAtPrice":
              nextData.compareAtPrice = value === null ? 0 : Number(value) || 0;
              break;
            case "category":
              nextData.category = String(value);
              break;
            case "tags":
              nextData.tags = Array.isArray(value) ? value : [];
              break;
            case "slug":
              nextData.slug = String(value);
              break;
            case "metaTitle":
              nextData.metaTitle = String(value);
              break;
            case "metaDescription":
              nextData.metaDescription = String(value);
              break;
            default:
              return product;
          }

          nextEdited[field] = true;

          return {
            ...product,
            data: nextData,
            editedFields: nextEdited,
          };
        })
      );
    },
    []
  );

  const updateProductImages = useCallback((index: number, images: string[]) => {
    setProducts((prev) =>
      prev.map((product, idx) =>
        idx === index && product.data
          ? { ...product, data: { ...product.data, images } }
          : product
      )
    );
  }, []);

  const updateProductSubcategory = useCallback((index: number, subcategory: string | null) => {
    setProducts((prev) =>
      prev.map((product, idx) =>
        idx === index && product.data
          ? { ...product, data: { ...product.data, subcategory } }
          : product
      )
    );
  }, []);

  const handleImproveWithAI = useCallback(
    async (index: number, forceOverwrite: boolean) => {
      const product = products[index];
      if (!product?.data) return;

      const editedFields = product.editedFields || {};
      const editedKeys = (
        Object.entries(editedFields) as [ImportEditableField, boolean][]
      )
        .filter(([, edited]) => edited)
        .map(([field]) => field);

      if (forceOverwrite && editedKeys.length > 0) {
        const labels = getEditedFieldLabels(editedFields).join(", ");
        if (
          !confirm(
            `Dette erstatter alle manuelle endringer (${labels}).\n\nEr du sikker på at du vil overskrive?`
          )
        ) {
          return;
        }
      } else if (!forceOverwrite && editedKeys.length > 0) {
        const labels = getEditedFieldLabels(editedFields).join(", ");
        if (
          !confirm(
            `Manuelt redigerte felt beholdes: ${labels}.\n\nVil du forbedre øvrige felt med AI?`
          )
        ) {
          return;
        }
      }

      setImprovingIndex(index);

      try {
        const response = await fetch("/api/admin/import/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product: product.data,
            preserveFields: forceOverwrite ? [] : editedKeys,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "AI-forbedring feilet");
        }

        const result = await response.json();
        const updates = result.updates || {};

        setProducts((prev) =>
          prev.map((item, idx) => {
            if (idx !== index || !item.data) return item;

            const nextData = { ...item.data };
            const nextEdited: Partial<Record<ImportEditableField, boolean>> = forceOverwrite
              ? {}
              : { ...(item.editedFields || {}) };

            if (updates.name !== undefined) {
              nextData.name = updates.name;
              delete nextEdited.name;
            }
            if (updates.description !== undefined) {
              nextData.description = updates.description;
              delete nextEdited.description;
            }
            if (updates.shortDescription !== undefined) {
              nextData.shortDescription = updates.shortDescription;
              delete nextEdited.shortDescription;
            }
            if (updates.category !== undefined) {
              nextData.category = updates.category;
              delete nextEdited.category;
            }
            if (updates.tags !== undefined) {
              nextData.tags = updates.tags;
              delete nextEdited.tags;
            }
            if (updates.slug !== undefined) {
              nextData.slug = updates.slug;
              delete nextEdited.slug;
            }
            if (updates.metaTitle !== undefined) {
              nextData.metaTitle = updates.metaTitle;
              delete nextEdited.metaTitle;
            }
            if (updates.metaDescription !== undefined) {
              nextData.metaDescription = updates.metaDescription;
              delete nextEdited.metaDescription;
            }
            if (updates.suggestedPrice !== undefined) {
              nextData.suggestedPrice = updates.suggestedPrice;
              delete nextEdited.suggestedPrice;
            }
            if (updates.compareAtPrice !== undefined) {
              nextData.compareAtPrice = updates.compareAtPrice;
              delete nextEdited.compareAtPrice;
            }
            if (updates.highlightedFeatures !== undefined) {
              nextData.highlightedFeatures = updates.highlightedFeatures;
            }

            nextData.aiGenerated = result.aiGenerated ?? true;
            nextData.aiWarning = result.warning;

            return {
              ...item,
              data: nextData,
              editedFields: nextEdited,
            };
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ukjent feil";
        alert(`Kunne ikke forbedre produkt: ${message}`);
      } finally {
        setImprovingIndex(null);
      }
    },
    [products]
  );

  const extractSupplierId = (url: string, currentProvider: Provider) => {
    if (currentProvider === "temu") {
      const match = url.match(/goods\.html\?goods_id=(\d+)/);
      return match ? match[1] : url.split("/").pop()?.split("?")[0] || "";
    }
    if (currentProvider === "alibaba") {
      const match = url.match(/product-detail\/(\d+)/);
      return match ? match[1] : url.split("/").pop()?.split(".")[0] || "";
    }
    return "";
  };

  const handleSaveAll = async () => {
    const successfulProducts = products.filter((p) => p.status === "success" && p.data);

    if (successfulProducts.length === 0) {
      alert("Ingen produkter å lagre!");
      return;
    }

    // Buyer decision levels: REJECTED hard-blocks; REVIEW needs confirmation; APPROVED passes
    const qualityIssues: string[] = [];
    const blockedProducts: string[] = [];
    const reviewProducts: string[] = [];
    for (const product of successfulProducts) {
      const data = product.data!;
      const result = runQualityCheck({
        name: data.name,
        description: data.description,
        originalTitle: data.originalName,
        images: data.images,
        suggestedPrice: data.suggestedPrice,
        costNOK: data.originalPrice,
        category: data.category,
        subcategory: data.subcategory,
        slug: data.slug,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        tags: data.tags,
        specs: data.specs,
        variantsCount: data.variants?.length ?? 0,
      });

      if (result.buyerDecision === "rejected" || !result.canImport) {
        const failed = result.checks
          .filter((check) => !check.ok && check.blocking)
          .map((check) => `${check.label}: ${check.detail ?? "feilet"}`)
          .join("; ");
        blockedProducts.push(
          `"${data.name || product.url}" (${result.overallScore.toFixed(1)}/10 · REJECTED) — ${failed || "avvist av kjøpspolicy"}`
        );
        continue;
      }

      if (result.buyerDecision === "review") {
        reviewProducts.push(
          `"${data.name || product.url}" (${result.overallScore.toFixed(1)}/10 · REVIEW)`
        );
      }

      if (!result.passed) {
        const failed = result.checks
          .filter((check) => !check.ok)
          .map((check) => check.label)
          .join(", ");
        qualityIssues.push(`"${data.name || product.url}": ${failed}`);
      }
    }

    if (blockedProducts.length > 0) {
      toast.error(
        `${blockedProducts.length} produkt(er) REJECTED (score under ${BUYER_REVIEW_MIN_SCORE} eller absolute butikkregler).`,
        { duration: 6000 }
      );
      alert(
        `Import blokkert for REJECTED-produkter:\n\n${blockedProducts.join(
          "\n\n"
        )}\n\nAbsolute regler (klær, voksen, kopi/varemerke, medisin, kosttilskudd, sikkerhetskritiske barneprodukter) og score under ${BUYER_REVIEW_MIN_SCORE} kan ikke importeres.\n\nREVIEW (${BUYER_REVIEW_MIN_SCORE}–${BUYER_APPROVED_SCORE}) kan fortsatt vurderes manuelt.`
      );
      return;
    }

    if (reviewProducts.length > 0) {
      const proceedReview = confirm(
        `${reviewProducts.length} produkt(er) er i REVIEW-sonen (score ${BUYER_REVIEW_MIN_SCORE}–${BUYER_APPROVED_SCORE} eller andre advarsler):\n\n${reviewProducts.join(
          "\n"
        )}\n\nPolicyen anbefaler forsiktighet, men du kan importere hvis du mener produktet passer.\n\nVil du fortsette?`
      );
      if (!proceedReview) return;
    }

    if (qualityIssues.length > 0) {
      const proceed = confirm(
        `Kvalitetssjekken fant mangler ved ${qualityIssues.length} produkt(er):\n\n${qualityIssues.join(
          "\n"
        )}\n\nVil du lagre likevel?`
      );
      if (!proceed) return;
    }

    if (!confirm(`Er du sikker på at du vil lagre ${successfulProducts.length} produkter?`)) {
      return;
    }

    setSaving(true);

    let savedCount = 0;
    let errorCount = 0;

    for (const product of successfulProducts) {
      try {
        const data = product.data!;

        // Persist specs, including the detected subcategory
        const specsToSave: Record<string, string> = {
          ...data.specs,
          ...(data.subcategory ? { Underkategori: data.subcategory } : {}),
        };

        // Include the subcategory as a searchable tag
        const tagsToSave = data.subcategory
          ? Array.from(new Set([...data.tags, data.subcategory.toLowerCase()]))
          : data.tags;

        const response = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            slug: data.slug,
            description: data.description,
            shortDescription: data.shortDescription,
            price: Math.round(data.suggestedPrice),
            compareAtPrice: data.compareAtPrice ? Math.round(data.compareAtPrice) : null,
            supplierPrice: Math.round(data.originalPrice),
            images: JSON.stringify(data.images),
            tags: JSON.stringify(tagsToSave),
            category: data.category,
            metaTitle: data.metaTitle,
            metaDescription: data.metaDescription,
            specs: specsToSave,
            supplierUrl: product.url,
            supplierName: data.supplier || provider,
            supplierProductId: extractSupplierId(product.url, provider),
            sku: `${provider.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            skipTitleImprovement: true,
            isActive: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Feil ved lagring");
        }

        const savedProduct = await response.json();
        const productId = savedProduct.id;

        const variantsToSave =
          data.variants && data.variants.length > 0
            ? data.variants
            : [
                {
                  name: "Standard",
                  price: Math.round(data.suggestedPrice),
                  compareAtPrice: data.compareAtPrice ? Math.round(data.compareAtPrice) : null,
                  image: data.images[0] || null,
                  attributes: {},
                  stock: null as number | null,
                  sku: null as string | null,
                },
              ];

        // Save variants individually so one failing variant doesn't
        // block the whole product
        let variantErrors = 0;
        for (const variant of variantsToSave) {
          try {
            const variantResponse = await fetch(`/api/admin/products/${productId}/variants`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: variant.name || "Standard",
                price: Math.round(variant.price || data.suggestedPrice),
                compareAtPrice: variant.compareAtPrice
                  ? Math.round(variant.compareAtPrice)
                  : null,
                supplierPrice: Math.round(data.originalPrice),
                image: variant.image || data.images[0] || null,
                attributes: variant.attributes || {},
                // Only send supplier stock when it exists; API defaults otherwise
                ...(typeof variant.stock === "number" ? { stock: variant.stock } : {}),
                ...(variant.sku ? { sku: variant.sku } : {}),
                isActive: true,
              }),
            });

            if (!variantResponse.ok) {
              const errorText = await variantResponse.text();
              console.warn(
                `[Import] Variant "${variant.name}" feilet:`,
                errorText || variantResponse.status
              );
              variantErrors++;
            }
          } catch (variantError) {
            console.warn(`[Import] Variant "${variant.name}" feilet:`, variantError);
            variantErrors++;
          }
        }

        if (variantErrors === variantsToSave.length) {
          throw new Error("Ingen varianter kunne lagres");
        }

        savedCount++;
      } catch (error) {
        console.error("Error saving product:", error);
        errorCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setSaving(false);

    if (savedCount > 0) {
      alert(
        `✅ ${savedCount} produkter lagret!${errorCount > 0 ? `\n⚠️ ${errorCount} produkter feilet.` : ""}`
      );
      window.location.href = "/admin/products";
    } else {
      alert("❌ Kunne ikke lagre produkter. Sjekk konsollen for feil.");
    }
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const retryProduct = async (index: number) => {
    setProducts((prev) =>
      prev.map((p, idx) =>
        idx === index ? { ...p, status: "pending", error: undefined, editedFields: {} } : p
      )
    );
    await handleImportAll();
  };

  const successCount = products.filter((p) => p.status === "success").length;
  const errorCount = products.filter((p) => p.status === "error").length;
  const loadingCount = products.filter((p) => p.status === "loading").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dark">AI Produktimport</h1>
          <p className="mt-1 text-gray-medium">
            Importer produkter fra Temu eller Alibaba med AI-generert innhold
          </p>
        </div>
        <Link
          href="/admin/products"
          className="rounded-lg border border-gray-border px-4 py-2 text-sm font-medium hover:bg-gray-light"
        >
          ← Tilbake til produkter
        </Link>
      </div>

      <div className="rounded-xl border border-gray-border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-dark">Kilde</label>
          <select
            value={provider}
            onChange={(e) => {
              const newProvider = e.target.value as Provider;
              saveUrlsToStorage(provider, urls);
              setProvider(newProvider);
            }}
            className="w-full rounded-lg border border-gray-border bg-white px-4 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:w-auto"
          >
            <option value="temu">Temu</option>
            <option value="alibaba">Alibaba</option>
          </select>
        </div>
        <label className="mb-2 block text-sm font-medium text-dark">
          Produkt URLs (én per linje)
        </label>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder={
            provider === "temu"
              ? "https://www.temu.com/goods.html?goods_id=123456789"
              : "https://www.alibaba.com/product-detail/123456789.html"
          }
          rows={8}
          className="w-full rounded-lg border border-gray-border p-3 font-mono text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleLoadUrls}
            className="flex items-center gap-2 rounded-lg bg-gray-600 px-6 py-3 text-white transition-colors hover:bg-gray-700"
          >
            <Upload size={20} />
            Last URLs
          </button>
          <button
            onClick={handleParse}
            disabled={!mounted || urls.trim().length === 0 || isLoadingFromStorage}
            className="flex items-center gap-2 rounded-lg bg-dark px-6 py-3 text-white transition-colors hover:bg-dark-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={20} />
            Parse URLs ({mounted ? urls.split("\n").filter((u) => u.trim()).length : 0})
          </button>
          {products.length > 0 && (
            <button
              onClick={handleImportAll}
              disabled={importing || loadingCount > 0}
              className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Importerer...
                </>
              ) : (
                <>
                  <Check size={20} />
                  Importer Alle ({products.length})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {products.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-gray-border bg-white p-4">
            <div className="text-2xl font-bold text-dark">{products.length}</div>
            <div className="text-sm text-gray-medium">Totalt</div>
          </div>
          <div className="rounded-lg border border-green-500 bg-white p-4">
            <div className="text-2xl font-bold text-green-600">{successCount}</div>
            <div className="text-sm text-gray-medium">Ferdig</div>
          </div>
          <div className="rounded-lg border border-yellow-500 bg-white p-4">
            <div className="text-2xl font-bold text-yellow-600">{loadingCount}</div>
            <div className="text-sm text-gray-medium">Laster</div>
          </div>
          <div className="rounded-lg border border-red-500 bg-white p-4">
            <div className="text-2xl font-bold text-red-600">{errorCount}</div>
            <div className="text-sm text-gray-medium">Feil</div>
          </div>
        </div>
      )}

      {products.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-dark">
              Produkter ({successCount}/{products.length} ferdig)
            </h2>
            {successCount > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Lagrer...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Lagre {successCount} Produkter
                  </>
                )}
              </button>
            )}
          </div>

          {products.map((product, index) => (
            <div
              key={index}
              className="rounded-xl border-l-4 bg-white p-6 shadow-sm"
              style={{
                borderColor:
                  product.status === "success"
                    ? "#00C853"
                    : product.status === "error"
                      ? "#e53935"
                      : product.status === "loading"
                        ? "#FFC107"
                        : "#ccc",
              }}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-brand hover:underline"
                    >
                      <ExternalLink size={14} />
                      URL #{index + 1}
                    </a>
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        product.status === "success"
                          ? "bg-green-100 text-green-700"
                          : product.status === "error"
                            ? "bg-red-100 text-red-700"
                            : product.status === "loading"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {product.status === "success"
                        ? "✓ Ferdig"
                        : product.status === "error"
                          ? "✗ Feil"
                          : product.status === "loading"
                            ? "⏳ Laster..."
                            : "⏸ Vent"}
                    </span>
                  </div>
                  <div className="break-all font-mono text-xs text-gray-medium">{product.url}</div>
                </div>
                <div className="flex gap-2">
                  {product.status === "error" && (
                    <button
                      onClick={() => retryProduct(index)}
                      className="rounded p-2 text-brand hover:bg-brand-light"
                      title="Prøv igjen"
                    >
                      <Check size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => removeProduct(index)}
                    className="rounded p-2 text-red-600 hover:bg-red-50"
                    title="Fjern"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {product.status === "loading" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-medium">
                    <Loader2 className="animate-spin" size={16} />
                    <span className="font-medium text-dark">
                      {IMPORT_STAGE_LABELS[product.stage || "scraping"]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(["scraping", "generating", "pricing", "seo"] as ImportStage[]).map(
                      (stage, stageIdx) => {
                        const stages: ImportStage[] = ["scraping", "generating", "pricing", "seo"];
                        const currentIdx = stages.indexOf(product.stage || "scraping");
                        return (
                          <div
                            key={stage}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              stageIdx < currentIdx
                                ? "bg-brand"
                                : stageIdx === currentIdx
                                  ? "animate-pulse bg-brand/60"
                                  : "bg-gray-200"
                            }`}
                            title={IMPORT_STAGE_LABELS[stage]}
                          />
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {product.status === "error" && (
                <div className="flex items-center gap-2 rounded bg-red-50 p-3 text-red-600">
                  <AlertCircle size={16} />
                  <span className="text-sm">{product.error}</span>
                </div>
              )}

              {product.status === "success" && product.data && (
                <ProductImportPreview
                  data={product.data}
                  editedFields={product.editedFields || {}}
                  improving={improvingIndex === index}
                  onFieldChange={(field, value) => updateProductField(index, field, value)}
                  onImprove={(forceOverwrite) => handleImproveWithAI(index, forceOverwrite)}
                  onImagesChange={(images) => updateProductImages(index, images)}
                  onSubcategoryChange={(subcategory) =>
                    updateProductSubcategory(index, subcategory)
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
