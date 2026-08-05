import { NextResponse } from "next/server";
import { classifyAdminError } from "@/lib/admin/data-errors";
import { logAdminError } from "@/lib/admin/admin-logger";
import { adminHttpStatus, reasonCode } from "@/lib/admin/reason-codes";

/**
 * Sanitize admin API failures — never return Prisma / stack to the client.
 * Infra failures → 503 + JSON. Never rethrow.
 */
export function adminErrorResponse(
  error: unknown,
  status = 503,
  label?: string
) {
  const classified = classifyAdminError(error, status);
  logAdminError(error, { api: label, label });

  const http = adminHttpStatus(classified.kind, status);
  return NextResponse.json(
    {
      ok: false,
      code: reasonCode(classified.kind).toUpperCase(),
      reason: reasonCode(classified.kind),
      message: classified.reason,
      error: classified.reason,
      kind: classified.kind,
      title: classified.title,
    },
    { status: http }
  );
}

/**
 * Wrap an admin route handler so nothing escapes as an uncaught throw.
 */
export function withAdminApi<TArgs extends unknown[]>(
  label: string,
  handler: (...args: TArgs) => Promise<Response>
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error: unknown) {
      return adminErrorResponse(error, 503, label);
    }
  };
}
