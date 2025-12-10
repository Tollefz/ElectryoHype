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
          include: {
            variants: true,
          },
        }),
      null,
      'admin:check-variants'
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const issues: Array<{
      type: string;
      severity: 'critical' | 'warning' | 'info';
      message: string;
      suggestion: string;
    }> = [];

    // Parse images and tags
    let images: string[] = [];
    let tags: string[] = [];

    try {
      images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
    } catch {
      images = [];
    }

    try {
      tags = typeof product.tags === 'string' ? JSON.parse(product.tags) : (product.tags || []);
    } catch {
      tags = [];
    }

    // Check 1: Images exist
    if (!images || images.length === 0) {
      issues.push({
        type: 'missing_image',
        severity: 'critical',
        message: 'Produktet mangler bilder',
        suggestion: 'Last opp minst 1 bilde for produktet',
      });
    }

    // Check 2: Minimum number of images
    if (images && images.length < 3) {
      issues.push({
        type: 'missing_image',
        severity: 'warning',
        message: `Bare ${images.length} bilde(r). Anbefaler minst 3 bilder.`,
        suggestion: 'Last opp flere produktbilder for bedre konvertering',
      });
    }

    // Check 3: Variant detection (from database variants or tags)
    const hasVariants = product.variants && product.variants.length > 0;
    
    const hasColorVariants = hasVariants
      ? product.variants.some(v => {
          const attrs = (v.attributes as Record<string, string>) || {};
          return Object.keys(attrs).some(k => 
            k.toLowerCase().includes('color') || 
            k.toLowerCase().includes('farge')
          );
        })
      : tags.some((tag: string) =>
          ['rød', 'blå', 'grønn', 'svart', 'hvit', 'gul', 'rosa', 'lilla', 'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple'].some(color =>
            tag.toLowerCase().includes(color)
          )
        );

    const hasSizeVariants = hasVariants
      ? product.variants.some(v => {
          const attrs = (v.attributes as Record<string, string>) || {};
          return Object.keys(attrs).some(k => 
            k.toLowerCase().includes('size') || 
            k.toLowerCase().includes('størrelse')
          );
        })
      : tags.some((tag: string) =>
          ['xs', 's', 'm', 'l', 'xl', 'xxl', 'small', 'medium', 'large'].some(size =>
            tag.toLowerCase() === size
          )
        );

    // Check 4: Color variants should have images
    if (hasColorVariants && images.length < 2) {
      issues.push({
        type: 'wrong_color',
        severity: 'warning',
        message: 'Produktet har fargevarianter men kun 1 bilde',
        suggestion: 'Last opp ett bilde per fargevariant',
      });
    }

    // Check 5: Variants without images
    if (hasVariants) {
      const variantsWithoutImages = product.variants.filter(v => !v.image);
      if (variantsWithoutImages.length > 0) {
        issues.push({
          type: 'missing_image',
          severity: 'warning',
          message: `${variantsWithoutImages.length} variant(er) mangler bilde`,
          suggestion: 'Legg til bilde for hver variant',
        });
      }
    }

    // Check 6: Price validation
    if (product.price <= 0) {
      issues.push({
        type: 'mismatched_price',
        severity: 'critical',
        message: 'Ugyldig pris (0 kr eller negativt)',
        suggestion: 'Sett riktig salgspris',
      });
    }

    if (product.compareAtPrice && product.compareAtPrice <= product.price) {
      issues.push({
        type: 'mismatched_price',
        severity: 'warning',
        message: 'Før-pris er lavere enn salgspris',
        suggestion: 'Før-pris skal være høyere enn salgspris',
      });
    }

    // Check 7: Supplier price vs selling price
    if (product.supplierPrice && product.supplierPrice >= product.price) {
      issues.push({
        type: 'mismatched_price',
        severity: 'critical',
        message: 'Leverandørpris er høyere enn salgspris (du taper penger!)',
        suggestion: 'Øk salgsprisen eller finn billigere leverandør',
      });
    }

    // Check 8: Description quality
    if (!product.description || product.description.length < 50) {
      issues.push({
        type: 'missing_image',
        severity: 'info',
        message: 'Kort eller manglende produktbeskrivelse',
        suggestion: 'Skriv en detaljert beskrivelse (minst 50 tegn)',
      });
    }

    // Check 9: Variant names consistency
    if (hasVariants && product.variants.length > 1) {
      const variantNames = product.variants.map(v => v.name).filter(Boolean);
      const uniqueNames = new Set(variantNames);
      if (variantNames.length !== uniqueNames.size) {
        issues.push({
          type: 'duplicate',
          severity: 'warning',
          message: 'Noen varianter har samme navn',
          suggestion: 'Gi hver variant et unikt navn',
        });
      }
    }

    return NextResponse.json({ issues });
  } catch (error: any) {
    console.error('Error checking variants:', error);
    return NextResponse.json(
      { error: error.message || 'Error checking variants' },
      { status: 500 }
    );
  }
}

