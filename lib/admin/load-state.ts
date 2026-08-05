/**
 * Explicit load state machine — never guess Empty when the request failed.
 *
 * Priority: loading → error* → success (incl. stale) → empty
 */

import type { AdminDataError, AdminErrorKind } from "@/lib/admin/data-errors";

export type LoadStatus =
  | "loading"
  | "success"
  | "empty"
  | "timeout"
  | "offline"
  | "database"
  | "api";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "success"; data: T; stale?: false }
  | {
      status: "success";
      data: T;
      stale: true;
      staleReason: string;
    }
  | { status: "empty" }
  | { status: "timeout"; error: AdminDataError }
  | { status: "offline"; error: AdminDataError }
  | { status: "database"; error: AdminDataError }
  | { status: "api"; error: AdminDataError };

/** Map classified error → explicit failure status (never empty). */
export function failureStatus(kind: AdminErrorKind): Exclude<
  LoadStatus,
  "loading" | "success" | "empty"
> {
  if (kind === "timeout") return "timeout";
  if (kind === "network") return "offline";
  if (kind === "database" || kind === "quota") return "database";
  return "api";
}

export function toFailureState(error: AdminDataError): Exclude<
  LoadState<never>,
  { status: "loading" } | { status: "success"; data: never } | { status: "empty" }
> {
  const status = failureStatus(error.kind);
  return { status, error } as Exclude<
    LoadState<never>,
    { status: "loading" } | { status: "success"; data: never } | { status: "empty" }
  >;
}

export function isFailureStatus(status: LoadStatus): boolean {
  return (
    status === "timeout" ||
    status === "offline" ||
    status === "database" ||
    status === "api"
  );
}

export function isSuccessState<T>(
  s: LoadState<T>
): s is Extract<LoadState<T>, { status: "success" }> {
  return s.status === "success";
}
