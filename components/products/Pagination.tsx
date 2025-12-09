"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="mt-8 flex items-center justify-between rounded-full border bg-white px-4 py-2">
      <Button variant="ghost" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
        Forrige
      </Button>
      <p className="text-sm text-secondary">
        Side {currentPage} av {totalPages}
      </p>
      <Button
        variant="ghost"
        disabled={currentPage >= totalPages}
        onClick={() => goToPage(currentPage + 1)}
      >
        Neste
      </Button>
    </div>
  );
}

