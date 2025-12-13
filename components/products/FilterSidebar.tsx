"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCategoryBySlug, CATEGORY_DEFINITIONS, type CategorySlug } from "@/lib/categories";

interface FilterSidebarProps {
  categories: CategorySlug[];
}

export function FilterSidebar({ categories }: FilterSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const activeCategory = searchParams.get("category");

  const updateParams = (params: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (!value) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    newParams.set("page", "1");
    router.push(`/products?${newParams.toString()}`);
  };

  return (
    <aside className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Kategorier</h3>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
            <input
              type="radio"
              name="category"
              checked={!activeCategory}
              onChange={() => updateParams({ category: null })}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
            />
            Alle kategorier
          </label>
          {categories.map((categorySlug) => {
            const categoryDef = CATEGORY_DEFINITIONS[categorySlug];
            if (!categoryDef) return null;
            return (
              <label key={categorySlug} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                <input
                  type="radio"
                  name="category"
                  checked={activeCategory === categorySlug}
                  onChange={() => updateParams({ category: categorySlug })}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
                />
                {categoryDef.label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Pris</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Fra (kr)</label>
              <Input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                className="w-full text-sm"
                min="0"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Til (kr)</label>
              <Input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="5000"
                className="w-full text-sm"
                min="0"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => updateParams({ minPrice, maxPrice })} 
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2"
              size="sm"
            >
              Bruk filter
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMinPrice("");
                setMaxPrice("");
                updateParams({ minPrice: null, maxPrice: null });
              }}
              className="border border-gray-300 hover:bg-gray-50 text-sm py-2"
              size="sm"
            >
              Nullstill
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

