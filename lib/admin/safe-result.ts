/**
 * Result-aware safe query — NEVER throws. Distinguishes empty vs failed.
 */

import { isDevelopment, isDatabaseConfigured } from "@/lib/utils/database-check";
import {
  classifyAdminError,
  type AdminDataError,
  type AdminErrorKind,
} from "@/lib/admin/data-errors";
import { logAdminError } from "@/lib/admin/admin-logger";
import { reasonCode } from "@/lib/admin/reason-codes";

export type SafeResult<T> =
  | { ok: true; data: T; error: null; reason: null }
  | {
      ok: false;
      data: null;
      error: AdminDataError;
      reason: AdminErrorKind;
      reasonCode: string;
    };

export async function safeQueryResult<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<SafeResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, error: null, reason: null };
  } catch (error: unknown) {
    const isDev = isDevelopment();
    const dbConfigured = isDatabaseConfigured();
    const classified = classifyAdminError(error);

    if (!(isDev && !dbConfigured)) {
      logAdminError(error, { label: label || "safeQueryResult", api: label });
    }

    return {
      ok: false,
      data: null,
      error: classified,
      reason: classified.kind,
      reasonCode: reasonCode(classified.kind),
    };
  }
}

/** Sync try — for non-async work in render helpers. Never throws. */
export function safeSync<T>(fn: () => T, label?: string): SafeResult<T> {
  try {
    return { ok: true, data: fn(), error: null, reason: null };
  } catch (error: unknown) {
    const classified = classifyAdminError(error);
    logAdminError(error, { label: label || "safeSync" });
    return {
      ok: false,
      data: null,
      error: classified,
      reason: classified.kind,
      reasonCode: reasonCode(classified.kind),
    };
  }
}

/** Backward-compatible wrapper — prefer safeQueryResult for new code. */
export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string
): Promise<T> {
  const result = await safeQueryResult(fn, label);
  if (result.ok) return result.data;
  return fallback;
}
