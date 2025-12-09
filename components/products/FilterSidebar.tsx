"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FilterSidebarProps {
  categories: string[];
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
    <aside className="space-y-6 rounded-lg border border-border bg-white p-6 shadow-komplett">
      <div>
        <h3 className="text-lg font-semibold text-primary">Kategorier</h3>
        <div className="mt-3 space-y-2">
          {categories.map((category) => (
            <label key={category} className="flex items-center gap-2 text-sm text-secondary">
              <input
                type="radio"
                name="category"
                checked={activeCategory === category}
                onChange={() => updateParams({ category })}
              />
              {category}
            </label>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 px-0 text-primary"
            onClick={() => updateParams({ category: null })}
          >
            Nullstill kategori
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900">Pris</h3>
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-secondary">Min</label>
            <Input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-secondary">Max</label>
            <Input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="5000"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => updateParams({ minPrice, maxPrice })} className="flex-1">
              Bruk
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMinPrice("");
                setMaxPrice("");
                updateParams({ minPrice: null, maxPrice: null });
              }}
            >
              Nullstill
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

