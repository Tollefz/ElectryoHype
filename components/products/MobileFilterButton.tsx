"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { FilterSidebar } from "./FilterSidebar";
import type { CategorySlug } from "@/lib/categories";

interface MobileFilterButtonProps {
  categories: CategorySlug[];
}

export function MobileFilterButton({ categories }: MobileFilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Filter button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Filter size={18} />
        <span>Filtrer</span>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Side panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">Filtrer produkter</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              <FilterSidebar categories={categories} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

