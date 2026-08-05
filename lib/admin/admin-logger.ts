/**
 * Admin-internal error logger — never surfaces to UI.
 * Keeps an in-memory ring for Systemstatus ("feil siste time").
 */

import { classifyAdminError, type AdminErrorKind } from "@/lib/admin/data-errors";

export type AdminLogEntry = {
  id: string;
  timestamp: string;
  level: "error" | "warn";
  kind: AdminErrorKind;
  message: string;
  stack?: string;
  route?: string;
  api?: string;
  requestId?: string;
  user?: string;
  browser?: string;
  label?: string;
};

const MAX = 200;
const ring: AdminLogEntry[] = [];

function push(entry: AdminLogEntry) {
  ring.unshift(entry);
  if (ring.length > MAX) ring.length = MAX;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type AdminLogContext = {
  route?: string;
  api?: string;
  requestId?: string;
  user?: string;
  browser?: string;
  label?: string;
};

export function logAdminError(error: unknown, ctx: AdminLogContext = {}): AdminLogEntry {
  const classified = classifyAdminError(error);
  const err = error instanceof Error ? error : null;
  const entry: AdminLogEntry = {
    id: newId(),
    timestamp: new Date().toISOString(),
    level: "error",
    kind: classified.kind,
    message: (classified.logMessage || classified.reason).slice(0, 2000),
    stack: err?.stack?.slice(0, 8000),
    route: ctx.route,
    api: ctx.api,
    requestId: ctx.requestId || newId(),
    user: ctx.user,
    browser: ctx.browser,
    label: ctx.label,
  };
  push(entry);
  // Structured server log — STRING ONLY.
  // Passing Error objects to console.error opens Next.js Dev Issues overlay.
  const line = `[admin-log] ${entry.timestamp} ${entry.kind} ${entry.label || entry.api || entry.route || ""} ${entry.message}`;
  console.warn(line);
  if (entry.stack && process.env.NEXT_PUBLIC_DEBUG === "true") {
    console.warn(`[admin-log:stack] ${entry.stack.slice(0, 2000)}`);
  }
  return entry;
}

export function getAdminErrorRing(opts?: { sinceMs?: number }): AdminLogEntry[] {
  const since = opts?.sinceMs ?? 60 * 60 * 1000;
  const cut = Date.now() - since;
  return ring.filter((e) => new Date(e.timestamp).getTime() >= cut);
}

export function adminErrorCountLastHour(): number {
  return getAdminErrorRing().length;
}
