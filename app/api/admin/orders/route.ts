import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/api-auth";
import { buildOrderListWhere } from "@/lib/ops/order-list-where";
import { logError } from "@/lib/utils/logger";

/**
 * GET /api/admin/orders — list ids (and light fields) for current filters.
 * Used by "Velg filtrerte" on /admin/orders.
 */
export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(250, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const fulfillment = searchParams.get("filter") || searchParams.get("fulfillment") || "alle";
    const statusChip = searchParams.get("chip") || "";
    const payment = searchParams.get("payment") || "alle";
    const emailStatus = searchParams.get("email") || "";
    const search = searchParams.get("search") || "";
    const archived = searchParams.get("archived") === "1";
    const skip = (page - 1) * limit;

    const where = buildOrderListWhere({
      fulfillment: statusChip ? "alle" : fulfillment,
      statusChip: statusChip || undefined,
      payment,
      emailStatus,
      search,
      archived,
    });

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          isTestOrder: true,
          archivedAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error: unknown) {
    logError(error, "[admin:orders:list]");
    return NextResponse.json(
      { ok: false, error: "Kunne ikke hente ordrer" },
      { status: 500 }
    );
  }
}
