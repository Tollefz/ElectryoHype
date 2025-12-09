import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';
import { improveTitle } from '@/lib/utils/improve-product-title';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        variants: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await (params instanceof Promise ? params : Promise.resolve(params));
    
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        orderItems: true,
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Produkt ikke funnet' },
        { status: 404 }
      );
    }

    // Check if product has associated orders
    if (product.orderItems.length > 0) {
      return NextResponse.json(
        { error: 'Kan ikke slette produkt som har tilknyttede ordre. Deaktiver produktet i stedet.' },
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
      { message: 'Produkt slettet' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunne ikke slette produkt' },
      { status: 500 }
    );
  }
}