/**
 * Canonical Result type for ElectroHypeX — never throw across render/API boundaries.
 */

import {
  classifyAdminError,
  type AdminDataError,
  type AdminErrorKind,
} from "@/lib/admin/data-errors";
import { reasonCode } from "@/lib/admin/reason-codes";
import { logAdminError } from "@/lib/admin/admin-logger";

export type AppError = AdminDataError & {
  code: string;
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: unknown, status?: number, label?: string): Result<never> {
  const classified = classifyAdminError(error, status);
  if (label) {
    logAdminError(error, { label });
  }
  return {
    ok: false,
    error: {
      ...classified,
      code: reasonCode(classified.kind).toUpperCase(),
    },
  };
}

export function errFromKind(
  kind: AdminErrorKind,
  message?: string
): Result<never> {
  const classified = classifyAdminError(
    message || kind,
    kind === "timeout" ? 408 : kind === "not_found" ? 404 : 503
  );
  // Force kind if classify drifted
  const forced: AppError = {
    ...classified,
    kind,
    reason: message || classified.reason,
    code: reasonCode(kind).toUpperCase(),
  };
  return { ok: false, error: forced };
}

/** Run async work → Result. Never throws. */
export async function asResult<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error: unknown) {
    return err(error, undefined, label);
  }
}

/** Re-export safe helpers that return SafeResult — prefer Result via asResult. */
export { safeQueryResult, safeQuery, safeSync } from "@/lib/admin/safe-result";
