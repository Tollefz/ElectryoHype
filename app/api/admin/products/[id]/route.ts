import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';
import { improveTitle } from '@/lib/utils/improve-product-title';
import { safeQuery } from '@/lib/safeQuery';
import { logError } from '@/lib/utils/logger';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { images, name, ...otherFields } = body;

    const updateData: any = { ...otherFields };
    if (images) {
      updateData.images = images;
    }
    
    // Forbedre produkt-tittel automatisk hvis name oppdateres
    if (name) {
      updateData.name = improveTitle(name);
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
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    // Delete variants first (cascade)
    if (product.variants.length > 0) {
      await prisma.productVariant.deleteMany({
        where: { productId: id },
      });
    }

    // Delete the product
    await prisma.product.delete({
      where: { id },
    });

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