import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  approveAiCategories,
  dismissAiCategories,
} from "@/lib/admin/ai-categorize";
import { getAllDbValues } from "@/lib/categories";
import { logError } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — pending / needs_review AI category queue
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const status = req.nextUrl.searchParams.get("status") || "pending";
    const statuses =
      status === "all"
        ? ["pending", "needs_review"]
        : status === "needs_review"
          ? ["needs_review"]
          : ["pending"];

    const products = await prisma.product.findMany({
      where: { aiCategoryStatus: { in: statuses } },
      orderBy: [{ aiCategoryConfidence: "desc" }, { updatedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        aiCategorySuggested: true,
        aiCategoryConfidence: true,
        aiCategoryReason: true,
        aiCategoryStatus: true,
        aiCategoryAt: true,
        images: true,
      },
    });

    const counts = await prisma.product.groupBy({
      by: ["aiCategoryStatus"],
      where: {
        aiCategoryStatus: { in: ["pending", "needs_review", "applied", "corrected"] },
      },
      _count: { _all: true },
    });

    const countMap = Object.fromEntries(
      counts.map((c) => [c.aiCategoryStatus || "", c._count._all])
    );

    return NextResponse.json({
      ok: true,
      categories: getAllDbValues(),
      counts: {
        pending: countMap.pending || 0,
        needs_review: countMap.needs_review || 0,
        applied: countMap.applied || 0,
        corrected: countMap.corrected || 0,
      },
      items: products.map((p) => ({
        productId: p.id,
        name: p.name,
        slug: p.slug,
        currentCategory: p.category,
        suggestedCategory: p.aiCategorySuggested,
        confidence: p.aiCategoryConfidence,
        reason: p.aiCategoryReason,
        status: p.aiCategoryStatus,
        at: p.aiCategoryAt,
        images: p.images,
      })),
    });
  } catch (error: unknown) {
    logError(error, "[category-audit GET]");
    return NextResponse.json({ ok: false, error: "Kunne ikke hente kø" }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    items: z
      .array(
        z.object({
          productId: z.string(),
          category: z.string().optional(),
          subcategory: z.string().nullable().optional(),
        })
      )
      .min(1),
  }),
  z.object({
    action: z.literal("approve_all_pending"),
  }),
  z.object({
    action: z.literal("dismiss"),
    productIds: z.array(z.string()).min(1),
  }),
]);

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = postSchema.parse(await req.json());

    if (body.action === "approve") {
      const { applied } = await approveAiCategories({ items: body.items });
      return NextResponse.json({
        ok: true,
        applied,
        message: `Godkjente ${applied} kategorier`,
      });
    }

    if (body.action === "approve_all_pending") {
      const pending = await prisma.product.findMany({
        where: { aiCategoryStatus: "pending" },
        select: { id: true, aiCategorySuggested: true },
        take: 2000,
      });
      const { applied } = await approveAiCategories({
        items: pending.map((p) => ({
          productId: p.id,
          category: p.aiCategorySuggested || undefined,
        })),
      });
      return NextResponse.json({
        ok: true,
        applied,
        message: `Godkjente ${applied} ventende forslag`,
      });
    }

    const dismissed = await dismissAiCategories(body.productIds);
    return NextResponse.json({
      ok: true,
      dismissed,
      message: `Avviste ${dismissed} forslag`,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[category-audit POST]");
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Handling feilet",
      },
      { status: 500 }
    );
  }
}
