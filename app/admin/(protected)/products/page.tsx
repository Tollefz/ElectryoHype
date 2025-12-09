"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/admin/products");
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-secondary">Laster produkter...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary">Produkter</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/products/temu-import"
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-dark transition-colors"
          >
            <Plus size={20} />
            Temu Bulk Import
          </Link>
          <Link
            href="/admin/products/bulk-import"
            className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-white hover:bg-accent-blue/90 transition-colors"
          >
            <Plus size={20} />
            Bulk Import
          </Link>
          <Link
            href="/admin/products/import"
            className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-white hover:bg-accent-green/90 transition-colors"
          >
            <Plus size={20} />
            Importer Produkt
          </Link>
        </div>
      </div>

      <ProductsTable products={products} onProductDeleted={fetchProducts} />
    </div>
  );
}

