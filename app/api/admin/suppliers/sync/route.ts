import { NextResponse } from "next/server";
import { z } from "zod";
import { SupplierName } from "@prisma/client";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  getCatalogProvider,
  isActiveCatalogSupplier,
  listActiveCatalogSupplierIds,
} from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import { runCatalogSync } from "@/lib/suppliers/sync/engine";
import { logError } from "@/lib/utils/logger";

function toSupplierName(id: CatalogSupplierId): SupplierName {
  return id as unknown as SupplierName;
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const supplierParam = searchParams.get("supplier") || listActiveCatalogSupplierIds()[0];
  if (!supplierParam || !isActiveCatalogSupplier(supplierParam)) {
    return NextResponse.json({ ok: false, error: "Ugyldig leverandør" }, { status: 400 });
  }
  const supplier = supplierParam as CatalogSupplierId;
  const supplierName = toSupplierName(supplier);

  const [imported, published, failedQueue, outOfStock, lastSync, nextHint, recentLogs, openChanges] =
    await Promise.all([
      prisma.product.count({ where: { supplierName } }),
      prisma.product.count({ where: { supplierName, isActive: true } }),
      prisma.importQueueItem.count({
        where: { supplier: supplierName, status: "failed" },
      }),
      prisma.product.count({
        where: {
          supplierName,
          OR: [{ supplierStatus: "out_of_stock" }, { stock: 0 }],
        },
      }),
      prisma.supplierSyncRun.findFirst({
        where: { supplier: supplierName },
        orderBy: { startedAt: "desc" },
      }),
      prisma.supplierSyncRun.findFirst({
        where: { supplier: supplierName, nextScheduledAt: { not: null } },
        orderBy: { nextScheduledAt: "desc" },
      }),
      prisma.supplierApiLog.findMany({
        where: { supplier },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.supplierChangeEvent.count({
        where: { supplier: supplierName, applied: false, dismissed: false },
      }),
    ]);

  const queueCounts = await prisma.importQueueItem.groupBy({
    by: ["status"],
    where: { supplier: supplierName },
    _count: { _all: true },
  });

  return NextResponse.json({
    ok: true,
    supplier,
    stats: {
      imported,
      published,
      failedImports: failedQueue,
      outOfStock,
      openChanges,
      lastSyncAt: lastSync?.finishedAt || lastSync?.startedAt || null,
      lastSyncStatus: lastSync?.status || null,
      lastSyncPriceChanges: lastSync?.changeEvents ?? lastSync?.priceChanges ?? 0,
      nextSyncAt: nextHint?.nextScheduledAt || null,
      queue: Object.fromEntries(queueCounts.map((c) => [c.status, c._count._all])),
    },
    recentLogs,
  });
}

const activeIds = listActiveCatalogSupplierIds() as [CatalogSupplierId, ...CatalogSupplierId[]];

const syncBodySchema = z.object({
  supplier: z.enum(activeIds).optional(),
  mode: z.enum(["inventory", "price", "both"]).default("both"),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = syncBodySchema.parse(await req.json());
    const targets: CatalogSupplierId[] = body.all
      ? listActiveCatalogSupplierIds()
      : body.supplier
        ? [body.supplier]
        : listActiveCatalogSupplierIds();

    const results = [];
    for (const supplier of targets) {
      const provider = getCatalogProvider(supplier);
      if (!(await provider.isConfigured())) {
        results.push({ supplier, skipped: true, reason: "not configured" });
        continue;
      }
      const sync = await runCatalogSync({ provider, applySafeUpdates: true });
      results.push({ supplier, ...sync });
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[admin:supplier-sync]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync feilet" },
      { status: 500 }
    );
  }
}
