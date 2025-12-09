/**
 * Script to automatically match images to product variants based on color names
 * This script analyzes product images and matches them to variants based on:
 * - Color keywords in image URLs
 * - Color keywords in variant names
 * - Image order/distribution
 */

import { prisma } from '../lib/prisma';

interface ColorMapping {
  keywords: string[];
  variants: string[];
}

const COLOR_MAPPINGS: Record<string, ColorMapping> = {
  'Svart': {
    keywords: ['black', 'svart', 'dark', '1', '01', 'b'],
    variants: ['Svart', 'Black', 'Sort'],
  },
  'Hvit': {
    keywords: ['white', 'hvit', 'light', '2', '02', 'w'],
    variants: ['Hvit', 'White', 'Hvit'],
  },
  'Grå': {
    keywords: ['gray', 'grey', 'grå', '3', '03', 'g'],
    variants: ['Grå', 'Grey', 'Gray', 'Grå'],
  },
  'Rød': {
    keywords: ['red', 'rød', '4', '04', 'r'],
    variants: ['Rød', 'Red'],
  },
  'Blå': {
    keywords: ['blue', 'blå', '5', '05'],
    variants: ['Blå', 'Blue'],
  },
  'Grønn': {
    keywords: ['green', 'grønn', '6', '06'],
    variants: ['Grønn', 'Green'],
  },
  'Gul': {
    keywords: ['yellow', 'gul', '7', '07'],
    variants: ['Gul', 'Yellow'],
  },
  'Rosa': {
    keywords: ['pink', 'rosa', '8', '08'],
    variants: ['Rosa', 'Pink'],
  },
  'Lilla': {
    keywords: ['purple', 'lilla', '9', '09'],
    variants: ['Lilla', 'Purple'],
  },
  'Sølv': {
    keywords: ['silver', 'sølv', '10'],
    variants: ['Sølv', 'Silver'],
  },
  'Rosa Gull': {
    keywords: ['rosegold', 'rose-gold', 'rosa-gull', 'rose', 'gold'],
    variants: ['Rosa Gull', 'Rose Gold', 'RoseGold'],
  },
};

/**
 * Find the best matching image for a variant based on color
 */
function findMatchingImage(
  variantName: string,
  images: string[],
  variantIndex: number,
  totalVariants: number
): string | null {
  if (images.length === 0) return null;
  
  // Normalize variant name
  const variantLower = variantName.toLowerCase();
  
  // Find color mapping for this variant
  let colorMapping: ColorMapping | null = null;
  for (const [color, mapping] of Object.entries(COLOR_MAPPINGS)) {
    if (mapping.variants.some(v => v.toLowerCase() === variantLower)) {
      colorMapping = mapping;
      break;
    }
  }
  
  // Strategy 1: Try to find image with color keyword in URL
  if (colorMapping) {
    for (const keyword of colorMapping.keywords) {
      const matchingImage = images.find(img => 
        img.toLowerCase().includes(keyword.toLowerCase())
      );
      if (matchingImage) {
        return matchingImage;
      }
    }
  }
  
  // Strategy 2: Check if variant name appears in image URL
  const variantKeywords = variantName.toLowerCase().split(/\s+/);
  for (const keyword of variantKeywords) {
    if (keyword.length > 2) { // Skip short words
      const matchingImage = images.find(img => 
        img.toLowerCase().includes(keyword)
      );
      if (matchingImage) {
        return matchingImage;
      }
    }
  }
  
  // Strategy 3: Distribute images evenly across variants
  // If we have multiple images, assign them based on index
  if (images.length >= totalVariants) {
    return images[variantIndex];
  } else if (images.length > 1) {
    // Cycle through available images
    return images[variantIndex % images.length];
  }
  
  // Strategy 4: Use first image as fallback
  return images[0];
}

/**
 * Update variant images for a single product
 */
async function updateProductVariants(productId: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
      },
    });

    if (!product) {
      console.log(`❌ Product ${productId} not found`);
      return { updated: false, reason: 'not_found' };
    }

    // Parse images
    let images: string[] = [];
    try {
      if (product.images) {
        images = typeof product.images === 'string' 
          ? JSON.parse(product.images) 
          : product.images;
      }
    } catch (e) {
      console.log(`⚠️ Could not parse images for product ${productId}`);
      return { updated: false, reason: 'parse_error' };
    }

    if (images.length === 0) {
      console.log(`⚠️ No images for product ${productId}`);
      return { updated: false, reason: 'no_images' };
    }

    if (product.variants.length === 0) {
      console.log(`⚠️ No variants for product ${productId}`);
      return { updated: false, reason: 'no_variants' };
    }

    // Update each variant with matching image
    let updatedCount = 0;
    for (let i = 0; i < product.variants.length; i++) {
      const variant = product.variants[i];
      const matchingImage = findMatchingImage(
        variant.name,
        images,
        i,
        product.variants.length
      );

      if (matchingImage && variant.image !== matchingImage) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { image: matchingImage },
        });
        updatedCount++;
        console.log(`  ✅ Updated variant "${variant.name}" with image`);
      } else if (matchingImage) {
        console.log(`  ✓ Variant "${variant.name}" already has correct image`);
      } else {
        console.log(`  ⚠️ No matching image for variant "${variant.name}"`);
      }
    }

    return { 
      updated: updatedCount > 0, 
      updatedCount,
      totalVariants: product.variants.length 
    };
  } catch (error) {
    console.error(`❌ Error updating product ${productId}:`, error);
    return { updated: false, reason: 'error', error };
  }
}

/**
 * Main function to update all products
 */
async function updateAllProducts() {
  console.log('🚀 Starting variant image matching for all products...\n');

  try {
    // Get all products with variants
    const products = await prisma.product.findMany({
      where: {
        variants: {
          some: {},
        },
      },
      include: {
        variants: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📦 Found ${products.length} products with variants\n`);

    let totalUpdated = 0;
    let totalVariantsUpdated = 0;
    const results: Array<{ productId: string; name: string; result: any }> = [];

    for (const product of products) {
      console.log(`\n📦 Processing: ${product.name.substring(0, 60)}...`);
      const result = await updateProductVariants(product.id);
      
      results.push({
        productId: product.id,
        name: product.name,
        result,
      });

      if (result.updated) {
        totalUpdated++;
        totalVariantsUpdated += result.updatedCount || 0;
      }

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n\n📊 SUMMARY:');
    console.log(`✅ Products updated: ${totalUpdated}/${products.length}`);
    console.log(`✅ Variants updated: ${totalVariantsUpdated}`);
    console.log(`\n📋 Detailed results:`);
    
    results.forEach(({ name, result }) => {
      if (result.updated) {
        console.log(`  ✅ ${name.substring(0, 50)}: ${result.updatedCount} variants updated`);
      } else if (result.reason === 'no_images') {
        console.log(`  ⚠️ ${name.substring(0, 50)}: No images`);
      } else if (result.reason === 'no_variants') {
        console.log(`  ⚠️ ${name.substring(0, 50)}: No variants`);
      }
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  updateAllProducts()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { updateAllProducts, updateProductVariants, findMatchingImage };
