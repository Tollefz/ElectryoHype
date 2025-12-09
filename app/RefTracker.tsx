"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function RefTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;
    const key = `ref-tracked-${ref}`;
    if (typeof window !== "undefined" && localStorage.getItem(key)) return;

    fetch("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: ref,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }),
    }).catch((err) => console.error("ref track failed", err));

    if (typeof window !== "undefined") {
      localStorage.setItem(key, "1");
      document.cookie = `affiliateCode=${ref};path=/;max-age=${60 * 60 * 24 * 30}`;
    }
  }, [searchParams]);

  return null;
}

