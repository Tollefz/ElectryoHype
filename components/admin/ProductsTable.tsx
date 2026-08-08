"use client";

import {
  Pencil,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Package,
  Plus,
  X,
  ExternalLink,
  Check,
  Database,
} from "lucide-react";
import toast from "react-hot-toast";
import { getAllDbValues } from "@/lib/categories";
import SafeProductThumb from "@/components/admin/SafeProductThumb";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  price: number;
  supplierPrice?: number | null;
  margin?: number | null;
  marginPct?: number | null;
  category: string | null;
  isActive: boolean;
  images: string[] | string;
  supplierUrl?: string | null;
  supplierName?: string | null;
  supplierProductId?: string | null;
  temuGoodsId?: string | null;
  sku?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  tags?: string[];
  createdAt?: string;
  flags?: {
    missingCategory: boolean;
    noSeo: boolean;
    needsReview: boolean;
    lowScore: boolean;
    archived: boolean;
    importedToday: boolean;
    aiPending?: boolean;
    aiNeedsReview?: boolean;
    needsNorwegianTitle?: boolean;
  };
  categorySuggestion?: {
    category: string;
    subcategory: string | null;
    label: string;
    confidence: "high" | "medium";
    aiConfidence?: number | null;
    aiReason?: string | null;
    aiStatus?: string | null;
  } | null;
  aiCategory?: {
    suggested: string;
    confidence: number | null;
    reason: string | null;
    status: string | null;
  } | null;
}

function parseImages(images: string[] | string) {
  if (Array.isArray(images)) return images;
  try {
    const parsed = JSON.parse(images);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isOrdersConflictMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("tilknyttede ordre") ||
    lower.includes("eksisterende ordre") ||
    lower.includes("existing order") ||
    (lower.includes("ordre") && lower.includes("slette"))
  );
}

function sourceLabel(supplierName?: string | null, url?: string | null): string {
  const name = (supplierName || "").toLowerCase();
  if (name === "temu" || (url && /temu\.com/i.test(url))) return "Temu";
  if (name === "alibaba") return "Alibaba";
  if (name === "ebay") return "eBay";
  if (url) return "Kilde";
  return "—";
}

interface ProductsTableProps {
  products: AdminProductRow[];
  categories: string[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectPage: (checked: boolean) => void;
  onProductUpdated: () => void;
  onAcceptSuggestion: (product: AdminProductRow) => Promise<void>;
}

export default function ProductsTable({
  products,
  categories,
  selectedIds,
  onToggleSelect,
  onToggleSelectPage,
  onProductUpdated,
  onAcceptSuggestion,
}: ProductsTableProps) {
  const categoryOptions = categories.length > 0 ? categories : getAllDbValues();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [ordersConflict, setOrdersConflict] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    field: "name" | "price" | "category" | "status";
  } | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  const allPageSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const somePageSelected = products.some((p) => selectedIds.has(p.id)) && !allPageSelected;

  useEffect(() => {
    if (!editing) return;
    if (editing.field === "category" || editing.field === "status") {
      selectRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [editing]);

  const startEdit = (product: AdminProductRow, field: "name" | "price" | "category" | "status") => {
    setEditing({ id: product.id, field });
    if (field === "name") setDraft(product.name);
    else if (field === "price") setDraft(String(product.price));
    else if (field === "category") setDraft(product.category || "");
    else setDraft(product.isActive ? "active" : "inactive");
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const patchProduct = async (id: string, body: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const response = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Kunne ikke lagre");
      }
      toast.success("Lagret");
      onProductUpdated();
      cancelEdit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunne ikke lagre");
    } finally {
      setSavingId(null);
    }
  };

  const saveEdit = async (product: AdminProductRow) => {
    if (!editing || editing.id !== product.id) return;

    if (editing.field === "name") {
      const name = draft.trim();
      if (!name) {
        toast.error("Tittel kan ikke være tom");
        return;
      }
      if (name === product.name) {
        cancelEdit();
        return;
      }
      await patchProduct(product.id, { name, skipTitleImprovement: true });
      return;
    }

    if (editing.field === "price") {
      const price = Number(draft.replace(",", "."));
      if (!Number.isFinite(price) || price <= 0) {
        toast.error("Ugyldig pris");
        return;
      }
      if (price === product.price) {
        cancelEdit();
        return;
      }
      await patchProduct(product.id, { price });
      return;
    }

    if (editing.field === "category") {
      const category = draft || null;
      if (category === product.category) {
        cancelEdit();
        return;
      }
      await patchProduct(product.id, { category });
      return;
    }

    if (editing.field === "status") {
      const isActive = draft === "active";
      if (isActive === product.isActive) {
        cancelEdit();
        return;
      }
      await patchProduct(product.id, { isActive });
    }
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`Er du sikker på at du vil slette "${productName}"? Denne handlingen kan ikke angres.`)) {
      return;
    }

    setDeletingId(productId);
    try {
      const response = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      if (!response.ok) {
        let errorMessage = "Kunne ikke slette produkt";
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
        } catch {
          // keep default
        }

        if (response.status === 404) {
          toast.error("Produktet finnes ikke lenger.");
          onProductUpdated();
          return;
        }

        if (response.status === 400 && isOrdersConflictMessage(errorMessage)) {
          setOrdersConflict({ id: productId, name: productName });
          return;
        }

        toast.error(errorMessage);
        return;
      }

      toast.success("Produkt slettet");
      onProductUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunne ikke slette produkt");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeactivate = async () => {
    if (!ordersConflict) return;
    const { id, name } = ordersConflict;
    setDeactivatingId(id);
    try {
      const response = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Kunne ikke deaktivere produkt");
        return;
      }
      setOrdersConflict(null);
      toast.success(`"${name}" er deaktivert`);
      onProductUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunne ikke deaktivere produkt");
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleAccept = async (product: AdminProductRow) => {
    if (!product.categorySuggestion) return;
    setAcceptingId(product.id);
    try {
      await onAcceptSuggestion(product);
    } finally {
      setAcceptingId(null);
    }
  };

  if (products.length === 0) {
    return (
      <div className="rounded-lg bg-white border border-gray-200 p-8 sm:p-12 text-center shadow-sm">
        <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Ingen produkter funnet</h2>
        <p className="text-sm text-gray-600 mb-4">Prøv et annet filter, eller importer produkter</p>
        <Link
          href="/admin/suppliers"
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus size={16} />
          Importer via leverandør
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg bg-white border border-gray-200 shadow-sm">
        <div className="overflow-x-auto max-h-[min(70vh,900px)] overflow-y-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={(e) => onToggleSelectPage(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    aria-label="Velg alle på siden"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-14">
                  Bilde
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Tittel
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-28">
                  Pris
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-28">
                  Margin
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-48">
                  Kategori
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-28">
                  Leverandør
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-24">
                  Kilde
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-28">
                  Status
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-28">
                  Handlinger
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {products.map((product) => {
                const images = parseImages(product.images);
                const isEditing = editing?.id === product.id;
                const flags = product.flags;
                const rowHighlight =
                  flags?.missingCategory || flags?.noSeo || flags?.lowScore || flags?.needsReview
                    ? "bg-amber-50/40"
                    : "";

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      selectedIds.has(product.id) ? "bg-green-50/50" : rowHighlight
                    }`}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => onToggleSelect(product.id)}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        aria-label={`Velg ${product.name}`}
                      />
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <div className="relative h-10 w-10 overflow-hidden rounded-md bg-gray-100">
                        {images[0] ? (
                          <SafeProductThumb src={images[0]} alt="" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-300">
                            <Package size={16} />
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 align-middle max-w-[280px]">
                      {isEditing && editing.field === "name" ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={inputRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit(product);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            onBlur={() => void saveEdit(product)}
                            className="w-full rounded border border-green-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                            disabled={savingId === product.id}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(product, "name")}
                          className="text-left w-full group"
                          title="Klikk for å redigere tittel"
                        >
                          <span className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-green-700">
                            {product.name}
                          </span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {flags?.needsNorwegianTitle && (
                              <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-900">
                                Trenger norsk tittel
                              </span>
                            )}
                            {flags?.missingCategory && (
                              <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800">
                                Mangler kategori
                              </span>
                            )}
                            {flags?.noSeo && (
                              <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-100 text-sky-800">
                                Mangler SEO
                              </span>
                            )}
                            {flags?.lowScore && (
                              <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-800">
                                Lav score
                              </span>
                            )}
                            {flags?.needsReview && !flags.lowScore && (
                              <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-800">
                                Trenger review
                              </span>
                            )}
                          </div>
                          {product.sku && (
                            <span className="block text-[11px] text-gray-400 mt-0.5 truncate">
                              {product.sku}
                            </span>
                          )}
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      {isEditing && editing.field === "price" ? (
                        <input
                          ref={inputRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEdit(product);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={() => void saveEdit(product)}
                          className="w-24 rounded border border-green-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                          disabled={savingId === product.id}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(product, "price")}
                          className="text-sm font-semibold text-gray-900 hover:text-green-700"
                          title="Klikk for å redigere pris"
                        >
                          {product.price.toLocaleString("no-NO")},-
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      {product.marginPct != null ? (
                        <div
                          className={`text-xs ${
                            product.marginPct < 35 ? "font-semibold text-red-700" : "text-gray-700"
                          }`}
                          title={
                            product.supplierPrice != null
                              ? `Kost ${product.supplierPrice.toLocaleString("no-NO")},- → dekning ${product.margin?.toLocaleString("no-NO")},-`
                              : undefined
                          }
                        >
                          {product.marginPct.toFixed(0)}%
                          <div className="text-[10px] text-gray-500">
                            kost {product.supplierPrice?.toLocaleString("no-NO") ?? "—"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      {isEditing && editing.field === "category" ? (
                        <select
                          ref={selectRef}
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            void patchProduct(product.id, {
                              category: e.target.value || null,
                            });
                          }}
                          onBlur={cancelEdit}
                          className="w-full rounded border border-green-400 px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-200"
                          disabled={savingId === product.id}
                        >
                          <option value="">Ingen kategori</option>
                          {categoryOptions.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => startEdit(product, "category")}
                            className={`text-sm text-left hover:text-green-700 ${
                              flags?.missingCategory ? "text-amber-700 font-medium" : "text-gray-700"
                            }`}
                            title="Klikk for å endre kategori"
                          >
                            {product.category || "— Sett kategori —"}
                          </button>
                          {product.categorySuggestion && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="text-[11px] text-gray-500 truncate max-w-[160px]"
                                title={
                                  product.categorySuggestion.aiReason ||
                                  product.categorySuggestion.label
                                }
                              >
                                {product.aiCategory ? "AI: " : "Forslag: "}
                                {product.categorySuggestion.label}
                                {product.categorySuggestion.aiConfidence != null
                                  ? ` (${product.categorySuggestion.aiConfidence} %)`
                                  : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleAccept(product)}
                                disabled={acceptingId === product.id}
                                className="inline-flex items-center gap-0.5 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {acceptingId === product.id ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <Check size={10} />
                                )}
                                Accept
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <span className="text-sm text-gray-700 capitalize">
                        {product.supplierName || "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      {product.supplierUrl ? (
                        <a
                          href={product.supplierUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={product.supplierUrl}
                          className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800 hover:underline"
                        >
                          <ExternalLink size={12} />
                          {sourceLabel(product.supplierName, product.supplierUrl)}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      {isEditing && editing.field === "status" ? (
                        <select
                          ref={selectRef}
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            void patchProduct(product.id, {
                              isActive: e.target.value === "active",
                            });
                          }}
                          onBlur={cancelEdit}
                          className="rounded border border-green-400 px-2 py-1 text-sm bg-white"
                          disabled={savingId === product.id}
                        >
                          <option value="active">Aktiv</option>
                          <option value="inactive">Inaktiv</option>
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(product, "status")}
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            product.flags?.archived
                              ? "bg-gray-200 text-gray-700"
                              : product.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                          }`}
                          title="Klikk for å endre status"
                        >
                          {product.flags?.archived
                            ? "Arkivert"
                            : product.isActive
                              ? "Aktiv"
                              : "Inaktiv"}
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex gap-1">
                        <Link
                          href={`/admin/products/edit/${product.id}`}
                          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
                          title="Rediger produkt"
                        >
                          <Pencil size={14} />
                        </Link>
                        <Link
                          href={`/admin/products/${product.id}/edit-variants`}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                          title="Rediger variant-bilder"
                        >
                          <ImageIcon size={14} />
                        </Link>
                        {product.supplierName || product.supplierProductId ? (
                          <Link
                            href={`/admin/products/${product.id}/supplier-raw`}
                            className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"
                            title="Leverandørdata (raw, versjoner, endringer)"
                          >
                            <Database size={14} />
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDelete(product.id, product.name)}
                          disabled={deletingId === product.id}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          aria-label="Slett produkt"
                        >
                          {deletingId === product.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {ordersConflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orders-conflict-title"
        >
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <h2 id="orders-conflict-title" className="text-base font-semibold text-gray-900">
                Kan ikke slette produktet
              </h2>
              <button
                type="button"
                onClick={() => setOrdersConflict(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Lukk"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">«{ordersConflict.name}»</span> har eksisterende ordrer
                og kan derfor ikke slettes.
              </p>
              <p className="text-sm text-gray-600">
                Du kan deaktivere produktet i stedet. Da skjules det i butikken.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setOrdersConflict(null)}
                disabled={deactivatingId === ordersConflict.id}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={deactivatingId === ordersConflict.id}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {deactivatingId === ordersConflict.id ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deaktiverer…
                  </>
                ) : (
                  "Deaktiver produkt"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
