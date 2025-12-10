import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';
import { safeQuery } from '@/lib/safeQuery';

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const product = await safeQuery(
      () =>
        prisma.product.findUnique({
          where: { id: productId },
        }),
      null,
      'admin:auto-fix-variants'
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let images: string[] = [];
    try {
      images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
    } catch {
      images = [];
    }

    const updates: any = {};

    // Fix 1: Ensure at least 1 image
    if (!images || images.length === 0) {
      updates.images = JSON.stringify([
        'https://placehold.co/600x600/e2e8f0/64748b?text=' + encodeURIComponent(product.name.substring(0, 50)),
      ]);
    }

    // Fix 2: Ensure compareAtPrice is higher than price
    if (product.compareAtPrice && product.compareAtPrice <= product.price) {
      updates.compareAtPrice = Math.round(product.price * 1.25); // 25% higher
    }

    // Fix 3: Ensure reasonable price margins
    if (product.supplierPrice && product.supplierPrice >= product.price) {
      updates.price = Math.round(product.supplierPrice * 2.5); // 150% markup
    }

    // Fix 4: Auto-generate description if missing
    if (!product.description || product.description.length < 50) {
      updates.description = `${product.name} er et premium produkt i kategorien ${product.category || 'Elektronikk'}. 

Dette produktet tilbyr høy kvalitet og god verdi for pengene. 

Perfekt for både hjemmebruk og profesjonell bruk. 

Rask levering og god kundeservice inkludert.`;
    }

    // Fix 5: Auto-generate short description
    if (!product.shortDescription) {
      updates.shortDescription = `Premium ${(product.category || 'Elektronikk').toLowerCase()} med høy kvalitet og god pris.`;
    }

    // Apply fixes
    if (Object.keys(updates).length > 0) {
      await prisma.product.update({
        where: { id: productId },
        data: updates,
      });
    }

    return NextResponse.json({ 
      success: true, 
      fixesApplied: Object.keys(updates).length,
      fixes: Object.keys(updates),
    });
  } catch (error: any) {
    console.error('Error auto-fixing variants:', error);
    return NextResponse.json(
      { error: error.message || 'Error auto-fixing variants' },
      { status: 500 }
    );
  }
}

