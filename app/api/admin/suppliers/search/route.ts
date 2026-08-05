import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  getCatalogProvider,
  isActiveCatalogSupplier,
  listActiveCatalogSupplierIds,
  listCatalogSuppliers,
} from "@/lib/suppliers/registry";
import type { CatalogSupplierId, SupplierSortBy } from "@/lib/suppliers/provider";
import { logError } from "@/lib/utils/logger";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.get("meta") === "1") {
      const providers = await Promise.all(
        listCatalogSuppliers({ includeComing: true, includeLegacy: true }).map(async (meta) => {
          if (meta.status !== "active") {
            return {
              id: meta.id,
              displayName: meta.displayName,
              status: meta.status,
              href: meta.href,
              description: meta.description,
              configured: false,
            };
          }
          const p = getCatalogProvider(meta.id);
          return {
            id: meta.id,
            displayName: meta.displayName,
            status: meta.status,
            href: meta.href,
            description: meta.description,
            configured: await p.isConfigured(),
          };
        })
      );
      return NextResponse.json({ ok: true, suppliers: providers });
    }

    const supplierParam = searchParams.get("supplier") || listActiveCatalogSupplierIds()[0];
    if (!supplierParam || !isActiveCatalogSupplier(supplierParam)) {
      return NextResponse.json(
        { ok: false, error: `Ukjent eller inaktiv leverandør: ${supplierParam}` },
        { status: 400 }
      );
    }
    const supplier = supplierParam as CatalogSupplierId;

    const provider = getCatalogProvider(supplier);
    if (!(await provider.isConfigured())) {
      return NextResponse.json(
        {
          ok: false,
          error: `Leverandør ${provider.displayName} er ikke konfigurert. Sett API-nøkkel i .env.`,
        },
        { status: 503 }
      );
    }

    const result = await provider.searchProducts({
      query: searchParams.get("q") || searchParams.get("query") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      warehouse: searchParams.get("warehouse") || undefined,
      minPrice: searchParams.get("minPrice")
        ? Number(searchParams.get("minPrice"))
        : undefined,
      maxPrice: searchParams.get("maxPrice")
        ? Number(searchParams.get("maxPrice"))
        : undefined,
      minStock: searchParams.get("minStock")
        ? Number(searchParams.get("minStock"))
        : undefined,
      maxDeliveryDays: searchParams.get("maxDeliveryDays")
        ? Number(searchParams.get("maxDeliveryDays"))
        : undefined,
      sortBy: (searchParams.get("sortBy") as SupplierSortBy) || "relevance",
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
    });

    return NextResponse.json({ ok: true, supplier, ...result });
  } catch (error: unknown) {
    logError(error, "[admin:suppliers:search]");
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Søk feilet",
      },
      { status: 500 }
    );
  }
}

const activeIds = listActiveCatalogSupplierIds() as [CatalogSupplierId, ...CatalogSupplierId[]];

const importBodySchema = z.object({
  supplier: z.enum(activeIds),
  ids: z.array(z.string().min(1)).min(1).max(100),
  processNow: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = importBodySchema.parse(await req.json());
    const provider = getCatalogProvider(body.supplier);
    if (!(await provider.isConfigured())) {
      return NextResponse.json(
        { ok: false, error: `Leverandør ${provider.displayName} er ikke konfigurert` },
        { status: 503 }
      );
    }

    const result = await provider.importProducts(body.ids, {
      createdById: auth.userId,
      createdByEmail: auth.email,
    });

    let processed: unknown[] = [];
    if (body.processNow && result.queueItemIds.length > 0) {
      const { processImportQueueItem } = await import("@/lib/suppliers/import-queue");
      processed = [];
      for (const id of result.queueItemIds.slice(0, 20)) {
        try {
          processed.push(await processImportQueueItem(id));
        } catch (error: unknown) {
          processed.push({
            ok: false,
            id,
            error: error instanceof Error ? error.message : "feil",
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      processed,
      message: `${result.imported} lagt i importkø${result.skipped ? `, ${result.skipped} allerede i kø` : ""}`,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[admin:suppliers:import]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Import feilet" },
      { status: 500 }
    );
  }
}
