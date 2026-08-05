import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { classifyAdminError } from "@/lib/admin/data-errors";
import {
  logAdminError,
  getAdminErrorRing,
  adminErrorCountLastHour,
} from "@/lib/admin/admin-logger";
import { resetDatabaseCircuit } from "@/lib/ops/db-circuit";
import { systemHealthCache } from "@/lib/ops/system-health-cache";
import { beginDbRoute } from "@/lib/db/query-metrics";

export const dynamic = "force-dynamic";

type ServiceStatus = "ok" | "degraded" | "down" | "unknown";

type ServiceRow = {
  id: string;
  label: string;
  status: ServiceStatus;
  detail: string;
  latencyMs?: number;
  kind?: string;
};

type HealthPayload = {
  ok: boolean;
  status: "ok" | "degraded" | "down";
  database: ServiceStatus;
  latencyMs: number;
  checkedAt: string;
  reason: string;
  kind: string | null;
  services: ServiceRow[];
  errorsLastHour: number;
  recentErrors: Array<{
    id: string;
    timestamp: string;
    kind: string;
    label?: string;
    message: string;
  }>;
  cached?: boolean;
};

/**
 * Cheap DB probe ONLY — never heavy reads / analytics / counts / workers.
 */
async function probeDatabase(): Promise<{
  status: ServiceStatus;
  detail: string;
  latencyMs: number;
  kind?: string;
  logMessage?: string;
}> {
  const started = Date.now();
  let prismaError: unknown = null;
  const query = prisma.$queryRaw`SELECT 1`.catch((e: unknown) => {
    prismaError = e;
    throw e;
  });
  try {
    await Promise.race([
      query,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("__health_deadline__")), 5000)
      ),
    ]);
    const latencyMs = Date.now() - started;
    console.warn(`[health:probe] OK SELECT 1 latencyMs=${latencyMs}`);
    resetDatabaseCircuit();
    return {
      status: latencyMs > 2000 ? "degraded" : "ok",
      detail:
        latencyMs > 2000
          ? "Databasen svarer tregt"
          : "Databasen er tilgjengelig",
      latencyMs,
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "__health_deadline__" &&
      !prismaError
    ) {
      await new Promise((r) => setTimeout(r, 800));
    }
    const root = prismaError ?? error;
    const latencyMs = Date.now() - started;
    const classified = classifyAdminError(root);
    console.warn(
      `[health:probe] FAIL SELECT 1 latencyMs=${latencyMs} kind=${classified.kind} raw=${(classified.logMessage || "").slice(0, 300)}`
    );
    return {
      status: "down",
      detail: classified.reason,
      latencyMs,
      kind: classified.kind,
      logMessage: classified.logMessage,
    };
  }
}

async function buildHealthPayload(): Promise<HealthPayload> {
  const started = Date.now();
  const db = await probeDatabase();
  const services: ServiceRow[] = [
    {
      id: "database",
      label: "Database",
      status: db.status,
      detail: db.detail,
      latencyMs: db.latencyMs,
      kind: db.kind,
    },
    {
      id: "api",
      label: "API",
      status: "ok",
      detail: "Admin API svarer",
      latencyMs: Date.now() - started,
    },
    {
      id: "openai",
      label: "OpenAI",
      status: process.env.OPENAI_API_KEY ? "ok" : "unknown",
      detail: process.env.OPENAI_API_KEY
        ? "API-nøkkel konfigurert"
        : "Mangler OPENAI_API_KEY (valgfritt for health)",
    },
    {
      id: "cron",
      label: "Cron",
      status: process.env.INTERNAL_CRON_TOKEN ? "ok" : "unknown",
      detail: process.env.INTERNAL_CRON_TOKEN
        ? "Cron-token konfigurert"
        : "Mangler INTERNAL_CRON_TOKEN (valgfritt for health)",
    },
    {
      id: "redis",
      label: "Redis",
      status: process.env.REDIS_URL ? "ok" : "unknown",
      detail: process.env.REDIS_URL
        ? "REDIS_URL satt"
        : "Ikke konfigurert (valgfritt)",
    },
  ];

  const errorCount = adminErrorCountLastHour();
  const recentErrors = getAdminErrorRing({ sinceMs: 60 * 60 * 1000 });

  const status: "ok" | "degraded" | "down" =
    db.status === "down"
      ? "down"
      : db.status === "degraded" || errorCount > 20
        ? "degraded"
        : "ok";

  return {
    ok: status !== "down",
    status,
    database: db.status,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
    reason:
      db.status === "down"
        ? db.detail
        : status === "degraded"
          ? "En eller flere tjenester er degraderte"
          : "Systemet er tilgjengelig",
    kind: db.kind || null,
    services,
    errorsLastHour: errorCount,
    recentErrors: recentErrors.slice(0, 20).map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      kind: e.kind,
      label: e.label || e.api || e.route,
      message: classifyAdminError(e.message).reason,
    })),
  };
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const end = beginDbRoute("/api/admin/system-health");
  try {
    console.warn("[health:request] GET /api/admin/system-health");
    const cached = systemHealthCache.get("health") as HealthPayload | undefined;
    if (cached) {
      console.warn(
        `[health:response] CACHED status=${cached.status} database=${cached.database}`
      );
      return NextResponse.json({ ...cached, cached: true });
    }

    const payload = (await systemHealthCache.getOrSet(
      "health",
      () => buildHealthPayload(),
      (p) => p.status !== "down"
    )) as HealthPayload;

    console.warn(
      `[health:response] status=${payload.status} database=${payload.database} kind=${payload.kind}`
    );
    return NextResponse.json({ ...payload, cached: false });
  } finally {
    end();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "client_error") {
      logAdminError(body.message || body.stack || "client_error", {
        route: typeof body.route === "string" ? body.route : undefined,
        browser: typeof body.browser === "string" ? body.browser : undefined,
        label: "client_error",
        user: auth.email ?? undefined,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, reason: "unknown", message: "Ukjent action" },
      { status: 400 }
    );
  } catch (error: unknown) {
    logAdminError(error, { api: "system-health:POST" });
    return NextResponse.json(
      {
        ok: false,
        reason: "server_error",
        message: "Kunne ikke lagre feilrapport",
      },
      { status: 503 }
    );
  }
}
