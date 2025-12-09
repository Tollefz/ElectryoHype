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
      className="rounded-full border px-4 py-2 text-sm text-secondary"
    >
      <option value="newest">Nyeste først</option>
      <option value="price-asc">Pris: lav til høy</option>
      <option value="price-desc">Pris: høy til lav</option>
      <option value="name">Navn: A-Å</option>
    </select>
  );
}

