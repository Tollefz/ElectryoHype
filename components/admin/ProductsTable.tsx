"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Pencil, Trash2, ExternalLink, Loader2, Image as ImageIcon, Package, Plus } from "lucide-react";

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
              // Handle both { error: "..." } and { ok: false, error: "..." } formats
              errorMessage = data.error || data.message || errorMessage;
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
        
        // For 404 errors (product not found), show a more user-friendly message
        if (response.status === 404) {
          errorMessage = "Produktet finnes ikke lenger. Det kan ha blitt slettet av en annen bruker.";
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
      const errorMessage = error instanceof Error ? error.message : "Kunne ikke slette produkt";
      
      // Show user-friendly error message
      alert(errorMessage);
      
      // For 404 errors (product not found), refresh the list to remove stale data
      if (error instanceof Error && errorMessage.includes("finnes ikke")) {
        if (onProductDeleted) {
          onProductDeleted();
        } else {
          router.refresh();
        }
        // Remove from local state if product doesn't exist
        setLocalProducts((prev) => prev.filter((p) => p.id !== productId));
      } else {
        // Re-fetch products on other errors to restore state
        if (onProductDeleted) {
          onProductDeleted();
        }
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (localProducts.length === 0) {
    return (
      <div className="rounded-lg bg-white border border-gray-200 p-8 sm:p-12 text-center shadow-sm">
        <Package className="mx-auto mb-4 h-12 w-12 sm:h-16 sm:w-16 text-gray-300" />
        <h2 className="mb-2 text-lg sm:text-xl font-semibold text-gray-900">Ingen produkter ennå</h2>
        <p className="text-sm text-gray-600 mb-4">Start med å opprette eller importere produkter</p>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          <Plus size={16} />
          Opprett første produkt
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white border border-gray-200 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Produkt</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Pris</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Kategori</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Leverandør</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Status</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Handlinger</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {localProducts.map((product) => {
              const images = parseImages(product.images);
              const mainImage = images[0] ?? "https://via.placeholder.com/100x100?text=Ingen+bilde";

              return (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="relative h-10 w-10 sm:h-12 sm:w-12 overflow-hidden rounded-lg bg-gray-100 flex-shrink-0">
                        <Image src={mainImage} alt={product.name} fill className="object-cover" sizes="48px" loading="lazy" />
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[200px] sm:max-w-none">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <span className="text-xs sm:text-sm font-semibold text-gray-900">{product.price.toLocaleString('no-NO')},-</span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <span className="text-xs sm:text-sm text-gray-600">{product.category ?? "-"}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex flex-col gap-1">
                      {product.supplierName && (
                        <span className="text-xs sm:text-sm font-medium text-gray-700 capitalize">{product.supplierName}</span>
                      )}
                      {product.supplierUrl ? (
                        <a
                          href={product.supplierUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:underline truncate max-w-[150px] sm:max-w-none"
                          title={product.supplierUrl}
                        >
                          <ExternalLink size={12} />
                          <span className="truncate">{product.supplierUrl}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Ingen URL</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <span
                      className={`inline-flex rounded-full px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium ${
                        product.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {product.isActive ? "Aktiv" : "Inaktiv"}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex gap-1 sm:gap-2">
                      <Link
                        href={`/admin/products/edit/${product.id}`}
                        className="rounded-lg p-1.5 sm:p-2 text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Rediger produkt"
                      >
                        <Pencil size={14} className="sm:w-4 sm:h-4" />
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}/edit-variants`}
                        className="rounded-lg p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Rediger variant-bilder"
                      >
                        <ImageIcon size={14} className="sm:w-4 sm:h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        disabled={deletingId === product.id}
                        className="rounded-lg p-1.5 sm:p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Slett produkt"
                      >
                        {deletingId === product.id ? (
                          <Loader2 size={14} className="animate-spin sm:w-4 sm:h-4" />
                        ) : (
                          <Trash2 size={14} className="sm:w-4 sm:h-4" />
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
  );
}
