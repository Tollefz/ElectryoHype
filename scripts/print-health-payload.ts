/**
 * Same probe + classification as GET /api/admin/system-health (no HTTP auth).
 * Run: npx tsx scripts/print-health-payload.ts
 */
import { PrismaClient } from "@prisma/client";
import { classifyAdminError } from "../lib/admin/data-errors";

const prisma = new PrismaClient({ log: [] });

async function main() {
  console.log("[health:request] script print-health-payload");
  const started = Date.now();
  let database: "ok" | "degraded" | "down" = "down";
  let detail = "";
  let kind: string | null = null;
  let latencyMs = 0;
  let prismaError: unknown = null;

  try {
    const t0 = Date.now();
    const query = prisma.$queryRaw`SELECT 1`.catch((e: unknown) => {
      prismaError = e;
      throw e;
    });
    await Promise.race([
      query,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("__health_deadline__")), 5000)
      ),
    ]);
    latencyMs = Date.now() - t0;
    database = latencyMs > 2000 ? "degraded" : "ok";
    detail =
      latencyMs > 2000
        ? "Databasen svarer tregt"
        : "Databasen er tilgjengelig";
    console.log(`[health:probe] OK SELECT 1 latencyMs=${latencyMs}`);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "__health_deadline__" &&
      !prismaError
    ) {
      await new Promise((r) => setTimeout(r, 800));
    }
    const root = prismaError ?? error;
    latencyMs = Date.now() - started;
    const c = classifyAdminError(root);
    database = "down";
    detail = c.reason;
    kind = c.kind;
    console.log(
      `[health:probe] FAIL SELECT 1 kind=${c.kind} raw=${(c.logMessage || "").slice(0, 400)}`
    );
  }

  const payload = {
    ok: database !== "down",
    status:
      database === "down"
        ? "down"
        : database === "degraded"
          ? "degraded"
          : "ok",
    database,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
    reason: detail,
    kind,
    services: [
      {
        id: "database",
        label: "Database",
        status: database,
        detail,
        latencyMs,
        kind,
      },
    ],
  };

  console.log("[health:response]");
  console.log(JSON.stringify(payload, null, 2));
}

void main()
  .catch((e) => {
    console.error("script error", e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore disconnect after failed connect */
    }
  });
