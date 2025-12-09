/**
 * Script to fix all products - ensure they have correct variants and images
 * This script:
 * 1. Checks all products for missing variants
 * 2. Creates variants based on product tags/images if missing
 * 3. Matches images to variants
 * 4. Updates variant images
 */

import { prisma } from '../lib/prisma';
import { updateProductVariants, findMatchingImage } from './auto-match-variant-images';

/**
 * Detect color variants from product tags
 */
function detectColorVariants(tags: string[]): string[] {
  const colorKeywords: Record<string, string> = {
    'svart': 'Svart',
    'black': 'Svart',
    'hvit': 'Hvit',
    'white': 'Hvit',
    'grå': 'Grå',
    'gray': 'Grå',
    'grey': 'Grå',
    'rød': 'Rød',
    'red': 'Rød',
    'blå': 'Blå',
    'blue': 'Blå',
    'grønn': 'Grønn',
    'green': 'Grønn',
    'gul': 'Gul',
    'yellow': 'Gul',
    'rosa': 'Rosa',
    'pink': 'Rosa',
    'lilla': 'Lilla',
    'purple': 'Lilla',
    'sølv': 'Sølv',
    'silver': 'Sølv',
    'rosa gull': 'Rosa Gull',
    'rose gold': 'Rosa Gull',
    'rosegold': 'Rosa Gull',
  };

  const foundColors = new Set<string>();
  
  tags.forEach(tag => {
    const tagLower = tag.toLowerCase();
    for (const [key, color] of Object.entries(colorKeywords)) {
      if (tagLower.includes(key)) {
        foundColors.add(color);
      }
    }
  });

  return Array.from(foundColors);
}

/**
 * Check if product should have variants based on name/tags
 */
function shouldHaveVariants(productName: string, tags: string[]): boolean {
  const nameLower = productName.toLowerCase();
  const allText = `${nameLower} ${tags.join(' ').toLowerCase()}`;
  
  // Check for variant indicators
  const variantIndicators = [
    'bracket', 'brakett', 'stand', 'stativ', 'holder',
    'universal', 'multi', 'bundle', 'pakke', 'sett',
    'color', 'farge', 'variant', 'option',
  ];

  return variantIndicators.some(indicator => allText.includes(indicator));
}

/**
 * Fix a single product - ensure it has correct variants
 */
async function fixProduct(productId: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
      },
    });

    if (!product) {
      return { fixed: false, reason: 'not_found' };
    }

    // Parse tags and images
    let tags: string[] = [];
    let images: string[] = [];
    
    try {
      if (product.tags) {
        tags = typeof product.tags === 'string' 
          ? JSON.parse(product.tags) 
          : product.tags;
      }
      if (product.images) {
        images = typeof product.images === 'string' 
          ? JSON.parse(product.images) 
          : product.images;
      }
    } catch (e) {
      // Continue with empty arrays
    }

    const hasVariants = product.variants.length > 0;
    const shouldHave = shouldHaveVariants(product.name, tags);
    
    let createdVariants = 0;
    let updatedVariants = 0;

    // If product should have variants but doesn't, create them
    if (shouldHave && !hasVariants) {
      console.log(`  📝 Creating variants for product...`);
      
      // Try to detect colors from tags
      const detectedColors = detectColorVariants(tags);
      
      // Default colors for brackets/holders
      const defaultColors = detectedColors.length > 0 
        ? detectedColors 
        : ['Svart', 'Hvit', 'Grå'];
      
      // Create variants
      for (let i = 0; i < defaultColors.length; i++) {
        const color = defaultColors[i];
        const variantImage = findMatchingImage(color, images, i, defaultColors.length);
        
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            name: color,
            sku: `${product.sku || product.slug || 'PROD'}-V${i + 1}`,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            supplierPrice: product.supplierPrice || product.price / 2,
            image: variantImage,
            attributes: {
              color: color,
            },
            stock: 10,
            isActive: true,
          },
        });
        
        createdVariants++;
      }
      
      console.log(`  ✅ Created ${createdVariants} variants`);
    }

    // Update variant images for existing variants
    if (product.variants.length > 0) {
      const result = await updateProductVariants(productId);
      updatedVariants = result.updatedCount || 0;
    }

    return {
      fixed: createdVariants > 0 || updatedVariants > 0,
      createdVariants,
      updatedVariants,
    };
  } catch (error) {
    console.error(`  ❌ Error fixing product:`, error);
    return { fixed: false, reason: 'error', error };
  }
}

/**
 * Main function to fix all products
 */
async function fixAllProducts() {
  console.log('🔧 Starting product variant fix for all products...\n');

  try {
    const products = await prisma.product.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📦 Found ${products.length} products\n`);

    let totalFixed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;

    for (const product of products) {
      console.log(`\n📦 Processing: ${product.name.substring(0, 60)}...`);
      const result = await fixProduct(product.id);
      
      if (result.fixed) {
        totalFixed++;
        totalCreated += result.createdVariants || 0;
        totalUpdated += result.updatedVariants || 0;
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\n\n📊 SUMMARY:');
    console.log(`✅ Products fixed: ${totalFixed}/${products.length}`);
    console.log(`✅ Variants created: ${totalCreated}`);
    console.log(`✅ Variants updated: ${totalUpdated}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fixAllProducts()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { fixAllProducts, fixProduct };
