"use client";

import Link from "next/link";
import { Plus, Search, Filter, X } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import ProductsTable from "@/components/admin/ProductsTable";

interface Product {
  id: string;
  name: string;
  price: number;
  category: string | null;
  isActive: boolean;
  images: string[] | string;
  supplierUrl?: string | null;
  supplierName?: string | null;
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/admin/products");
      if (response.ok) {
        const data = await response.json();
        // Handle new API response format
        if (data.ok && data.data) {
          setProducts(data.data);
        } else if (Array.isArray(data)) {
          // Fallback for old format
          setProducts(data);
        }
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          product.name.toLowerCase().includes(query) ||
          product.id.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (categoryFilter !== "all" && product.category !== categoryFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === "active" && !product.isActive) {
        return false;
      }
      if (statusFilter === "inactive" && product.isActive) {
        return false;
      }

      return true;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>
          <div className="text-sm font-medium text-gray-600">Laster produkter...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Produkter</h1>
          <p className="mt-1 text-sm text-gray-600">Administrer alle produkter i butikken</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link
            href="/admin/products/new"
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nytt Produkt</span>
            <span className="sm:hidden">Ny</span>
          </Link>
          <Link
            href="/admin/products/temu-import"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Temu Import</span>
            <span className="sm:hidden">Temu</span>
          </Link>
          <Link
            href="/admin/products/bulk-import"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Bulk Import</span>
            <span className="sm:hidden">Bulk</span>
          </Link>
          <Link
            href="/admin/products/import"
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Importer</span>
            <span className="sm:hidden">Import</span>
          </Link>
        </div>
      </div>

      {/* Search and filters */}
      <div className="rounded-lg bg-white border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Søk på produktnavn eller SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 bg-white"
          >
            <option value="all">Alle kategorier</option>
            {Array.from(new Set(products.map(p => p.category).filter(Boolean))).map(cat => (
              <option key={cat} value={cat || ""}>{cat}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 bg-white"
          >
            <option value="all">Alle statuser</option>
            <option value="active">Aktive</option>
            <option value="inactive">Inaktive</option>
          </select>
        </div>
      </div>

      {/* Filtered products count */}
      {searchQuery || categoryFilter !== "all" || statusFilter !== "all" ? (
        <div className="text-sm text-gray-600">
          Viser {filteredProducts.length} av {products.length} produkter
        </div>
      ) : null}

      <ProductsTable products={filteredProducts} onProductDeleted={fetchProducts} />
    </div>
  );
}

