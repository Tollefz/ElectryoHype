"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export function Pagination({ currentPage, totalPages }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/products?${params.toString()}`);
  };

  if (totalPages <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-1.5 sm:mt-12"
      aria-label="Sidenavigasjon"
    >
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
        className="ehx-btn ehx-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Forrige side"
      >
        <ChevronLeft size={16} />
        <span className="hidden sm:inline">Forrige</span>
      </button>

      {start > 1 ? (
        <>
          <button
            type="button"
            onClick={() => goToPage(1)}
            className="ehx-btn ehx-btn-secondary min-w-10 px-3 py-2 text-sm"
          >
            1
          </button>
          {start > 2 ? (
            <span className="px-1 text-[var(--text-muted)]">…</span>
          ) : null}
        </>
      ) : null}

      {pages.map((page) => {
        const active = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            onClick={() => goToPage(page)}
            aria-current={active ? "page" : undefined}
            className={`ehx-btn min-w-10 px-3 py-2 text-sm ${
              active
                ? "ehx-btn-primary"
                : "ehx-btn-secondary"
            }`}
          >
            {page}
          </button>
        );
      })}

      {end < totalPages ? (
        <>
          {end < totalPages - 1 ? (
            <span className="px-1 text-[var(--text-muted)]">…</span>
          ) : null}
          <button
            type="button"
            onClick={() => goToPage(totalPages)}
            className="ehx-btn ehx-btn-secondary min-w-10 px-3 py-2 text-sm"
          >
            {totalPages}
          </button>
        </>
      ) : null}

      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => goToPage(currentPage + 1)}
        className="ehx-btn ehx-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Neste side"
      >
        <span className="hidden sm:inline">Neste</span>
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
