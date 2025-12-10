import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/auth';
import { safeQuery } from '@/lib/safeQuery';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const products = await safeQuery(
      () =>
        prisma.product.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            variants: true,
          },
        }),
      [],
      'admin:variant-check'
    );

    const formattedProducts = products.map(product => {
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

      // Group variants by type (color, size, etc.)
      const variantsByType: Record<string, Array<{
        value: string;
        image?: string;
        colorCode?: string;
        price?: number;
      }>> = {};

      // Process database variants
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant) => {
          // Extract variant type from attributes
          const attributes = variant.attributes as Record<string, string> || {};
          const variantType = Object.keys(attributes)[0] || 'standard';
          const variantValue = Object.values(attributes)[0] || variant.name;

          if (!variantsByType[variantType]) {
            variantsByType[variantType] = [];
          }

          variantsByType[variantType].push({
            value: variantValue,
            image: variant.image || undefined,
            colorCode: variantType === 'color' || variantType === 'farge' ? getColorCode(variantValue) : undefined,
            price: variant.price ? Number(variant.price) : undefined,
          });
        });
      }

      // Also detect potential variants from tags (fallback)
      const colorVariants = tags.filter((tag: string) =>
        ['rød', 'blå', 'grønn', 'svart', 'hvit', 'gul', 'rosa', 'lilla', 'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple'].some(c =>
          tag.toLowerCase().includes(c)
        )
      );

      const sizeVariants = tags.filter((tag: string) =>
        ['xs', 's', 'm', 'l', 'xl', 'xxl'].includes(tag.toLowerCase())
      );

      const variants = [];

      // Add color variants from database
      if (variantsByType['color'] || variantsByType['farge']) {
        const colorVars = variantsByType['color'] || variantsByType['farge'] || [];
        if (colorVars.length > 0) {
          variants.push({
            type: 'color',
            name: 'Farge',
            options: colorVars,
          });
        }
      } else if (colorVariants.length > 0) {
        // Fallback: use tags
        variants.push({
          type: 'color',
          name: 'Farge',
          options: colorVariants.map((color: string, idx: number) => ({
            value: color,
            image: images[idx] || images[0],
            colorCode: getColorCode(color),
          })),
        });
      }

      // Add size variants from database
      if (variantsByType['size'] || variantsByType['størrelse']) {
        const sizeVars = variantsByType['size'] || variantsByType['størrelse'] || [];
        if (sizeVars.length > 0) {
          variants.push({
            type: 'size',
            name: 'Størrelse',
            options: sizeVars,
          });
        }
      } else if (sizeVariants.length > 0) {
        // Fallback: use tags
        variants.push({
          type: 'size',
          name: 'Størrelse',
          options: sizeVariants.map((size: string) => ({
            value: size.toUpperCase(),
          })),
        });
      }

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        images: images || [],
        variants: variants,
        issues: [] as Array<{
          type: string;
          severity: 'critical' | 'warning' | 'info';
          message: string;
          suggestion: string;
        }>,
        status: 'unchecked' as const,
      };
    });

    return NextResponse.json({ products: formattedProducts });
  } catch (error: any) {
    console.error('Error loading products:', error);
    return NextResponse.json(
      { error: error.message || 'Error loading products' },
      { status: 500 }
    );
  }
}

function getColorCode(colorName: string): string {
  const colorMap: Record<string, string> = {
    rød: '#ef4444',
    red: '#ef4444',
    blå: '#3b82f6',
    blue: '#3b82f6',
    grønn: '#10b981',
    green: '#10b981',
    svart: '#1f2937',
    black: '#1f2937',
    hvit: '#f3f4f6',
    white: '#f3f4f6',
    gul: '#fbbf24',
    yellow: '#fbbf24',
    rosa: '#ec4899',
    pink: '#ec4899',
    lilla: '#a855f7',
    purple: '#a855f7',
  };

  const normalizedColor = colorName.toLowerCase().trim();

  for (const [key, value] of Object.entries(colorMap)) {
    if (normalizedColor.includes(key)) {
      return value;
    }
  }

  return '#94a3b8'; // Default gray
}

