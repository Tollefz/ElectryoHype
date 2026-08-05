import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAdminSession } from '@/lib/api-auth';
import { improveTitle } from '@/lib/utils/improve-product-title';
import { safeQuery } from '@/lib/safeQuery';
import { logError } from '@/lib/utils/logger';
import { bulkDeleteProducts } from '@/lib/admin/bulk-product-cleanup';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const product = await safeQuery(
      () =>
        prisma.product.findUnique({
          where: { id },
          include: {
            variants: true,
          },
        }),
      null,
      'admin:product:get'
    );

    if (!product) {
      return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: product });
  } catch (error) {
    logError(error, '[api/admin/products/[id]] GET');
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { images, name, skipTitleImprovement, ...otherFields } = body;

    const existing = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        aiCategorySuggested: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
    }

    const updateData: Prisma.ProductUpdateInput = { ...otherFields };
    if (images) {
      updateData.images = images;
    }

    // Inline admin edits can skip auto-title cleanup
    if (name) {
      updateData.name = skipTitleImprovement ? String(name).trim() : improveTitle(name);
    }

    const nextCategory =
      typeof otherFields.category === "string" ? otherFields.category : undefined;
    const nextSubcategory =
      typeof otherFields.subcategory === "string" ? otherFields.subcategory : undefined;

    if (nextCategory !== undefined) {
      const { assertMainCategory, normalizeSubcategory } = await import(
        "@/lib/categories/tree"
      );
      const valid = assertMainCategory(nextCategory);
      if (!valid) {
        return NextResponse.json(
          { ok: false, error: "Ugyldig hovedkategori" },
          { status: 400 }
        );
      }
      updateData.category = valid;
      if (nextSubcategory !== undefined) {
        updateData.subcategory = normalizeSubcategory(valid, nextSubcategory);
      }
    }

    if (
      nextCategory !== undefined &&
      nextCategory !== existing.category
    ) {
      updateData.aiCategoryStatus = "corrected";
      updateData.aiCategoryAt = new Date();
      const { recordCategoryCorrection } = await import("@/lib/ops/category-learning");
      await recordCategoryCorrection({
        productId: existing.id,
        productName: typeof updateData.name === "string" ? updateData.name : existing.name,
        fromCategory: existing.category,
        toCategory: nextCategory,
        fromSubcategory: existing.subcategory,
        toSubcategory: nextSubcategory ?? existing.subcategory,
        reason: "Manuell kategoriendring i admin",
      });
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, data: product });
  } catch (error) {
    logError(error, '[api/admin/products/[id]] PATCH');
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    
    // Check if product exists
    const product = await safeQuery(
      () =>
        prisma.product.findUnique({
          where: { id },
          include: {
            variants: true,
            orderItems: true,
          },
        }),
      null,
      'admin:product:delete'
    );

    if (!product) {
      return NextResponse.json(
        { ok: false, error: 'Produkt ikke funnet' },
        { status: 404 }
      );
    }

    // Check if product has associated orders
    if (product.orderItems.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'Kan ikke slette produkt som har tilknyttede ordre. Deaktiver produktet i stedet.' },
        { status: 400 }
      );
    }

    const result = await bulkDeleteProducts([id]);
    if (result.updated !== 1) {
      return NextResponse.json(
        { ok: false, error: result.results[0]?.error || 'Kunne ikke slette produkt' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: true, message: 'Produkt slettet' },
      { status: 200 }
    );
  } catch (error) {
    logError(error, '[api/admin/products/[id]] DELETE');
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Kunne ikke slette produkt' },
      { status: 500 }
    );
  }
}