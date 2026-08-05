import { NextResponse } from "next/server";
import { z } from "zod";
import { ImportQueueStatus } from "@prisma/client";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  approveImportQueueItem,
  processImportQueueItem,
  processQueuedImports,
  publishImportQueueItem,
} from "@/lib/suppliers/import-queue";
import { logError } from "@/lib/utils/logger";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));
    const skip = (page - 1) * limit;

    const where = {
      ...(status && status !== "all"
        ? { status: status as ImportQueueStatus }
        : {}),
    };

    const [items, total, counts] = await Promise.all([
      prisma.importQueueItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.importQueueItem.count({ where }),
      prisma.importQueueItem.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  } catch (error: unknown) {
    logError(error, "[admin:import-queue:GET]");
    const { adminErrorResponse } = await import("@/lib/admin/api-error");
    return adminErrorResponse(error, 500, "import-queue:GET");
  }
}

const actionSchema = z.object({
  action: z.enum(["process", "process_all", "approve", "publish", "remove"]),
  ids: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = actionSchema.parse(await req.json());

    if (body.action === "process_all") {
      const results = await processQueuedImports(body.limit ?? 10);
      return NextResponse.json({ ok: true, results });
    }

    const ids = body.ids || [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Mangler ids" }, { status: 400 });
    }

    if (body.action === "remove") {
      const deleted = await prisma.importQueueItem.deleteMany({
        where: {
          id: { in: ids },
          status: { not: ImportQueueStatus.published },
        },
      });
      return NextResponse.json({ ok: true, deleted: deleted.count });
    }

    const results = [];
    for (const id of ids) {
      try {
        if (body.action === "process") results.push(await processImportQueueItem(id));
        else if (body.action === "approve") results.push(await approveImportQueueItem(id));
        else if (body.action === "publish") results.push(await publishImportQueueItem(id));
      } catch (error: unknown) {
        results.push({
          id,
          ok: false,
          error: error instanceof Error ? error.message : "feil",
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[admin:import-queue]");
    const { adminErrorResponse } = await import("@/lib/admin/api-error");
    return adminErrorResponse(error, 500, "import-queue:POST");
  }
}
