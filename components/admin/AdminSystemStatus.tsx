"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HealthStatus = "ok" | "degraded" | "down" | "loading";

/**
 * Compact traffic-light in admin header — infrastructure vs store at a glance.
 */
export function AdminSystemStatus() {
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [reason, setReason] = useState("Sjekker…");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          if (!cancelled) {
            setStatus("down");
            setReason("Ingen nettverk");
          }
          return;
        }
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        const res = await fetch("/api/admin/system-health", {
          signal: ac.signal,
          cache: "no-store",
        });
        clearTimeout(t);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.status === "ok" || data?.status === "degraded" || data?.status === "down") {
          // Header light follows DATABASE primarily
          const db =
            typeof data.database === "string"
              ? data.database
              : Array.isArray(data.services)
                ? data.services.find(
                    (s: { id?: string }) => s.id === "database"
                  )?.status
                : null;
          if (db === "down") {
            setStatus("down");
            setReason(data.reason || "Database nede");
          } else if (db === "degraded" || data.status === "degraded") {
            setStatus("degraded");
            setReason(data.reason || "Degradert");
          } else {
            setStatus("ok");
            setReason(data.reason || "OK");
          }
        } else {
          setStatus("down");
          setReason("Kunne ikke sjekke status");
        }
      } catch {
        if (!cancelled) {
          setStatus("down");
          setReason("Statussjekk feilet");
        }
      }
    };
    void check();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 60_000);
    const onOnline = () => void check();
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-400"
        : status === "loading"
          ? "bg-slate-300"
          : "bg-red-500";

  const label =
    status === "ok"
      ? "System OK"
      : status === "degraded"
        ? "Tregt"
        : status === "loading"
          ? "Sjekker"
          : "Nede";

  return (
    <Link
      href="/admin/suppliers/health"
      title={reason}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <span
        className={`h-2 w-2 rounded-full ${color} ${status === "loading" ? "animate-pulse" : ""}`}
        aria-hidden
      />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only">Systemstatus: {label}. {reason}</span>
    </Link>
  );
}
