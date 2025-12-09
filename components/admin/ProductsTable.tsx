"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Pencil, Trash2, ExternalLink, Loader2, Image as ImageIcon } from "lucide-react";

interface ProductRow {
  id: string;
  name: string;
  price: number;
  category: string | null;
  isActive: boolean;
  images: string[] | string;
  supplierUrl?: string | null;
  supplierName?: string | null;
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

interface ProductsTableProps {
  products: ProductRow[];
  onProductDeleted?: () => void;
}

export default function ProductsTable({ products, onProductDeleted }: ProductsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localProducts, setLocalProducts] = useState<ProductRow[]>(products);

  // Update local products when prop changes
  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`Er du sikker på at du vil slette "${productName}"? Denne handlingen kan ikke angres.`)) {
      return;
    }

    setDeletingId(productId);

    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        // Try to parse JSON error message, but handle empty responses
        let errorMessage = "Kunne ikke slette produkt";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const text = await response.text();
            if (text.trim()) {
              const data = JSON.parse(text);
              errorMessage = data.error || errorMessage;
            }
          } else {
            // If not JSON, try to get text
            const text = await response.text();
            if (text.trim()) {
              errorMessage = text;
            } else {
              errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
          }
        } catch (parseError) {
          // If JSON parsing fails, use status text
          errorMessage = `HTTP ${response.status}: ${response.statusText || "Ukjent feil"}`;
        }
        throw new Error(errorMessage);
      }

      // Remove product from local state immediately (optimistic update)
      setLocalProducts((prev) => prev.filter((p) => p.id !== productId));

      // Refresh from server to ensure consistency
      if (onProductDeleted) {
        onProductDeleted();
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      alert(error instanceof Error ? error.message : "Kunne ikke slette produkt");
      // Re-fetch products on error to restore state
      if (onProductDeleted) {
        onProductDeleted();
      }
    } finally {
      setDeletingId(null);
    }
  };
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-medium">Produkt</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Pris</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Kategori</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Leverandør</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Handlinger</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {localProducts.map((product) => {
            const images = parseImages(product.images);
                   const mainImage = images[0] ?? "https://via.placeholder.com/100x100?text=Ingen+bilde";

            return (
              <tr key={product.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-100">
                      <Image src={mainImage} alt={product.name} fill className="object-cover" />
                    </div>
                    <span className="font-medium">{product.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">{product.price} kr</td>
                <td className="px-6 py-4">{product.category ?? "-"}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {product.supplierName && (
                      <span className="text-sm font-medium text-gray-700">{product.supplierName}</span>
                    )}
                    {product.supplierUrl ? (
                      <a
                        href={product.supplierUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        title={product.supplierUrl}
                      >
                        <ExternalLink size={12} />
                        <span className="max-w-[200px] truncate">{product.supplierUrl}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Ingen URL</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      product.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {product.isActive ? "Aktiv" : "Inaktiv"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/products/edit/${product.id}`}
                      className="rounded-lg p-2 hover:bg-slate-100"
                      title="Rediger produkt"
                    >
                      <Pencil size={16} />
                    </Link>
                    <Link
                      href={`/admin/products/${product.id}/edit-variants`}
                      className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                      title="Rediger variant-bilder"
                    >
                      <ImageIcon size={16} />
                    </Link>
                    <button
                      onClick={() => handleDelete(product.id, product.name)}
                      disabled={deletingId === product.id}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Slett produkt"
                    >
                      {deletingId === product.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
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
  );
}

