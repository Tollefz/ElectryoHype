import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAuthSession } from '@/lib/auth';

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
    const { image, ...otherFields } = body;

    const updateData: Prisma.ProductVariantUpdateInput = { ...otherFields };
    if (image !== undefined) {
      updateData.image = image;
    }

    const variant = await prisma.productVariant.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(variant);
  } catch (error) {
    console.error('Error updating variant:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
