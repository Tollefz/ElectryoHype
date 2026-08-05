import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import { runMerchandiserScan } from "@/lib/suppliers/merchandiser";
import { listActiveCatalogSupplierIds } from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser";
import { logError } from "@/lib/utils/logger";

const bodySchema = z.object({
  targetCount: z.union([z.literal(10), z.literal(25), z.literal(100)]).optional(),
  shelves: z
    .array(
      z.enum([
        "today",
        "gaming",
        "mobil",
        "kontor",
        "hjem",
        "elektronikk",
        "trending",
        "new",
      ])
    )
    .optional(),
  suppliers: z.array(z.string()).optional(),
  autoQueue: z.boolean().optional(),
  deepAnalyzeTop: z.number().min(0).max(50).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const active = listActiveCatalogSupplierIds();
    const suppliers = (body.suppliers?.length
      ? body.suppliers.filter((s) => active.includes(s as CatalogSupplierId))
      : active) as CatalogSupplierId[];

    const result = await runMerchandiserScan({
      targetCount: body.targetCount,
      shelves: body.shelves as MerchandiserShelf[] | undefined,
      suppliers,
      autoQueue: body.autoQueue,
      deepAnalyzeTop: body.deepAnalyzeTop,
      actorEmail: auth.email,
    });

    return NextResponse.json({
      ...result,
      message: `Fant ${result.recommended} anbefalinger (scannet ${result.scanned})`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[merchandiser/scan]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Scan feilet" },
      { status: 500 }
    );
  }
}
