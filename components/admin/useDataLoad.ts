"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";
import {
  toFailureState,
  type LoadState,
} from "@/lib/admin/load-state";

const DEFAULT_TIMEOUT_MS = 10_000;

export type UseDataLoadOptions<T> = {
  /** Build request URL (re-run when deps change via reload/tick) */
  url: string;
  /**
   * Parse a successful JSON body into T.
   * Return `{ empty: true }` via throwing is NOT allowed — use isEmpty.
   * If body is ok but missing required payload, throw so we get Error — never Empty.
   */
  parse: (json: unknown) => T;
  /** True only when request succeeded and payload is legitimately empty */
  isEmpty?: (data: T) => boolean;
  timeoutMs?: number;
  enabled?: boolean;
  /**
   * Before fetch: if returns a failure LoadState, skip the expensive request
   * (e.g. health says database red).
   */
  preflight?: () => Promise<LoadState<T> | null>;
  /** Keep last success when a later request fails */
  keepStaleOnError?: boolean;
};

export type UseDataLoadResult<T> = {
  load: LoadState<T>;
  reload: () => void;
  /** Last known good data (even when load is failure/stale) */
  data: T | null;
};

/**
 * Fetch with explicit LoadState machine.
 * Empty ONLY when ok + isEmpty(data). Failures never become empty.
 * Optional stale-while-revalidate on error.
 */
export function useDataLoad<T>(opts: UseDataLoadOptions<T>): UseDataLoadResult<T> {
  const [load, setLoad] = useState<LoadState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const lastGood = useRef<T | null>(null);
  const alive = useRef(true);

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

    // Only show loading skeleton when we have nothing to display
    if (!lastGood.current) {
      setLoad({ status: "loading" });
    }

    void (async () => {
      try {
        if (opts.preflight) {
          const blocked = await opts.preflight();
          if (blocked && alive.current) {
            if (
              keepStale &&
              lastGood.current &&
              blocked.status !== "loading" &&
              blocked.status !== "success" &&
              blocked.status !== "empty"
            ) {
              setLoad({
                status: "success",
                data: lastGood.current,
                stale: true,
                staleReason: blocked.error.reason,
              });
            } else {
              setLoad(blocked);
            }
            return;
          }
        }

        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          throw Object.assign(new Error("offline"), { status: 0 });
        }

        const res = await fetch(opts.url, {
          signal: ac.signal,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            typeof json === "object" &&
            json &&
            ("message" in json || "error" in json)
              ? String(
                  (json as { message?: unknown; error?: unknown }).message ||
                    (json as { error?: unknown }).error
                )
              : `HTTP ${res.status}`;
          throw Object.assign(new Error(msg), { status: res.status });
        }

        // ok:false in JSON body (200/503 wrappers)
        if (
          typeof json === "object" &&
          json &&
          "ok" in json &&
          (json as { ok: unknown }).ok === false
        ) {
          const msg =
            String(
              (json as { message?: unknown; error?: unknown }).message ||
                (json as { error?: unknown }).error ||
                "Feil"
            );
          const status =
            typeof (json as { status?: unknown }).status === "number"
              ? Number((json as { status: number }).status)
              : res.status;
          throw Object.assign(new Error(msg), { status });
        }

        const parsed = opts.parse(json);
        if (!alive.current) return;

        lastGood.current = parsed;
        if (opts.isEmpty?.(parsed)) {
          setLoad({ status: "empty" });
        } else {
          setLoad({ status: "success", data: parsed });
        }
      } catch (e: unknown) {
        if (!alive.current) return;

        const isAbort =
          ac.signal.aborted ||
          (e as { name?: string })?.name === "AbortError";
        const status = isAbort
          ? 408
          : e && typeof e === "object" && "status" in e
            ? Number((e as { status: unknown }).status)
            : undefined;
        const msg = e instanceof Error ? e.message : String(e);
        const offline =
          msg === "offline" ||
          (typeof navigator !== "undefined" && navigator.onLine === false);
        const classified = classifyAdminError(
          isAbort ? "timeout" : e,
          offline ? 0 : status
        );
        const failure = toFailureState(classified);

        if (keepStale && lastGood.current) {
          setLoad({
            status: "success",
            data: lastGood.current,
            stale: true,
            staleReason: classified.reason,
          });
        } else {
          setLoad(failure);
        }
        console.warn(`[useDataLoad] ${opts.url} ${classified.kind}`);
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
    load,
    reload,
    data:
      load.status === "success"
        ? load.data
        : lastGood.current,
  };
}

/** @deprecated Prefer useDataLoad */
export type { AdminDataError };
