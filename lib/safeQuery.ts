/**
 * Run a Prisma/database query safely without crashing the app.
 * Prefer `safeQueryResult` when you need to distinguish empty vs failed.
 */

export { safeQuery, safeQueryResult } from "@/lib/admin/safe-result";
export type { SafeResult } from "@/lib/admin/safe-result";
