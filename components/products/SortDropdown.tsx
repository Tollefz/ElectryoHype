"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SortDropdown() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort") ?? "newest";

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", event.target.value);
    params.set("page", "1");
    router.push(`/products?${params.toString()}`);
  };

  return (
    <select
      value={sort}
      onChange={handleChange}
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
    >
      <option value="newest">Nyeste først</option>
      <option value="price-asc">Pris: lav til høy</option>
      <option value="price-desc">Pris: høy til lav</option>
      <option value="name">Navn: A-Å</option>
    </select>
  );
}

