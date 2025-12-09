import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const paramsResolved = params instanceof Promise ? await params : params;
    const body = await req.json();
    const { image, ...otherFields } = body;

    const updateData: any = { ...otherFields };
    if (image !== undefined) {
      updateData.image = image;
    }

    const variant = await prisma.productVariant.update({
      where: { id: paramsResolved.id },
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
