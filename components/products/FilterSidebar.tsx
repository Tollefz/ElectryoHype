"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CATEGORY_DEFINITIONS, type CategorySlug } from "@/lib/categories";

interface FilterSidebarProps {
  categories: CategorySlug[];
}

export function FilterSidebar({ categories }: FilterSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const activeCategory = searchParams.get("category");
  const inStockOnly = searchParams.get("inStock") === "true";

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
    <aside className="space-y-6 rounded-[var(--ehx-radius-md)] border border-[var(--border)] bg-white p-5 shadow-[var(--ehx-shadow-sm)]">
      <div>
        <h3 className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
          Kategorier
        </h3>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text)]">
            <input
              type="radio"
              name="category"
              checked={!activeCategory}
              onChange={() => updateParams({ category: null })}
              className="h-4 w-4 border-[var(--border-strong)] text-[var(--brand)] focus:ring-[var(--brand)]"
            />
            Alle kategorier
          </label>
          {categories.map((categorySlug) => {
            const categoryDef = CATEGORY_DEFINITIONS[categorySlug];
            if (!categoryDef) return null;
            return (
              <label
                key={categorySlug}
                className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text)]"
              >
                <input
                  type="radio"
                  name="category"
                  checked={activeCategory === categorySlug}
                  onChange={() => updateParams({ category: categorySlug })}
                  className="h-4 w-4 border-[var(--border-strong)] text-[var(--brand)] focus:ring-[var(--brand)]"
                />
                {categoryDef.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-6">
        <h3 className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
          Pris
        </h3>
        <div className="space-y-3">
          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">
                Fra (kr)
              </label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full rounded-[var(--ehx-radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)]">
                Til (kr)
              </label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="5000"
                min="0"
                className="w-full rounded-[var(--ehx-radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateParams({ minPrice, maxPrice })}
              className="ehx-btn ehx-btn-primary flex-1 py-2 text-sm"
            >
              Bruk filter
            </button>
            <button
              type="button"
              onClick={() => {
                setMinPrice("");
                setMaxPrice("");
                updateParams({ minPrice: null, maxPrice: null });
              }}
              className="ehx-btn ehx-btn-secondary flex-1 py-2 text-sm"
            >
              Nullstill
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-6">
        <h3 className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
          Lagerstatus
        </h3>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text)]">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) =>
              updateParams({ inStock: e.target.checked ? "true" : null })
            }
            className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--brand)] focus:ring-[var(--brand)]"
          />
          Kun produkter på lager
        </label>
      </div>
    </aside>
  );
}
