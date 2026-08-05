"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";
import type { DataStateKind } from "@/components/admin/DataState";
import { failureStatus } from "@/lib/admin/load-state";

const DEFAULT_TIMEOUT_MS = 10_000;

export type AdminFetchState<T> = {
  state: DataStateKind;
  /** Explicit load status for DataState status= prop */
  status: import("@/lib/admin/load-state").LoadStatus;
  data: T | null;
  error: AdminDataError | null;
  reload: () => void;
  isEmpty: boolean;
  stale: boolean;
  staleReason: string | null;
};

type Options<T> = {
  url: string;
  parse: (json: unknown) => T;
  isEmpty?: (data: T) => boolean;
  timeoutMs?: number;
  enabled?: boolean;
  keepStaleOnError?: boolean;
};

/**
 * Client fetch with timeout.
 * Empty ONLY when response ok and isEmpty(data). Failures never become empty.
 */
export function useAdminFetch<T>(opts: Options<T>): AdminFetchState<T> {
  const [state, setState] = useState<DataStateKind>("loading");
  const [status, setStatus] =
    useState<import("@/lib/admin/load-state").LoadStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AdminDataError | null>(null);
  const [stale, setStale] = useState(false);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const lastGood = useRef<T | null>(null);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (opts.enabled === false) return;

    const ac = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const keepStale = opts.keepStaleOnError !== false;

    if (!lastGood.current) {
      setState("loading");
      setStatus("loading");
    }
    setError(null);
    setStale(false);
    setStaleReason(null);

    void (async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          throw Object.assign(new Error("offline"), { status: 0 });
        }
        const res = await fetch(opts.url, { signal: ac.signal, cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || (json && typeof json === "object" && "ok" in json && json.ok === false)) {
          const msg =
            typeof json === "object" && json && ("message" in json || "error" in json)
              ? String(
                  (json as { message?: unknown; error?: unknown }).message ||
                    (json as { error?: unknown }).error
                )
              : `HTTP ${res.status}`;
          throw Object.assign(new Error(msg), { status: res.status });
        }
        const parsed = opts.parse(json);
        if (!alive.current) return;
        lastGood.current = parsed;
        setData(parsed);
        const empty = opts.isEmpty ? opts.isEmpty(parsed) : false;
        if (empty) {
          setState("empty");
          setStatus("empty");
        } else {
          setState("ready");
          setStatus("success");
        }
        setError(null);
        setStale(false);
        setStaleReason(null);
      } catch (e: unknown) {
        if (!alive.current) return;
        const isAbort =
          ac.signal.aborted || (e as { name?: string })?.name === "AbortError";
        const httpStatus = isAbort
          ? 408
          : e && typeof e === "object" && "status" in e
            ? Number((e as { status: unknown }).status)
            : undefined;
        const msg = e instanceof Error ? e.message : String(e);
        const offline =
          msg === "offline" ||
          (typeof navigator !== "undefined" && navigator.onLine === false);
        const err = classifyAdminError(isAbort ? "timeout" : e, offline ? 0 : httpStatus);
        const failStatus = failureStatus(err.kind);

        if (keepStale && lastGood.current) {
          setData(lastGood.current);
          setState("ready");
          setStatus("success");
          setStale(true);
          setStaleReason(err.reason);
          setError(err);
        } else {
          setError(err);
          setState(failStatus === "offline" ? "offline" : "error");
          setStatus(failStatus);
          setData(null);
        }
        console.warn(`[useAdminFetch] ${opts.url} ${err.kind}`);
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.url, opts.enabled, opts.timeoutMs, tick]);

  return {
    state,
    status,
    data,
    error,
    reload,
    isEmpty: status === "empty",
    stale,
    staleReason,
  };
}
