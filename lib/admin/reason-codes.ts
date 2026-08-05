/**
 * Map internal error kinds → stable API reason codes (never Prisma text).
 */

import type { AdminErrorKind } from "@/lib/admin/data-errors";

export function reasonCode(kind: AdminErrorKind): string {
  switch (kind) {
    case "database":
      return "database_unavailable";
    case "quota":
      return "database_quota";
    case "network":
      return "network_error";
    case "timeout":
      return "timeout";
    case "supplier":
      return "supplier_unavailable";
    case "auth":
      return "unauthorized";
    case "not_found":
      return "not_found";
    case "server":
      return "server_error";
    default:
      return "unknown";
  }
}

/** HTTP status for admin JSON APIs — infra → 503, else keep caller status. */
export function adminHttpStatus(kind: AdminErrorKind, preferred = 503): number {
  if (kind === "auth") return 401;
  if (kind === "not_found") return 404;
  if (
    kind === "database" ||
    kind === "quota" ||
    kind === "timeout" ||
    kind === "network" ||
    kind === "supplier" ||
    kind === "server" ||
    kind === "unknown"
  ) {
    return 503;
  }
  return preferred;
}
