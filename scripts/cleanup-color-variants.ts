/**
 * CLEANUP SCRIPT: Remove all non-black color variants
 * 
 * This script:
 * 1. Analyzes all products and their variants
 * 2. Identifies color variants (from attributes.color, attributes.farge, or variant name)
 * 3. Keeps only BLACK/SVART variants
 * 4. Soft-deletes (isActive = false) or hard-deletes non-black variants
 * 5. Logs all changes for review
 * 
 * SAFETY: This script uses soft-delete by default. Set HARD_DELETE=true to permanently remove.
 * 
 * Usage:
 *   npm run ts-node scripts/cleanup-color-variants.ts
 *   npm run ts-node scripts/cleanup-color-variants.ts -- --dry-run
 *   npm run ts-node scripts/cleanup-color-variants.ts -- --hard-delete
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Valid black color names (case-insensitive)
const BLACK_COLORS = [
  'black', 'svart', 'BLACK', 'SVART', 'Black', 'Svart',
  '#000000', '#000', '000000', '000',
  'sort', 'Sort', 'SORT', // Alternative Norwegian
];

// Check if a color string represents black
function isBlackColor(color: string | null | undefined): boolean {
  if (!color) return false;
  const normalized = color.trim().toLowerCase();
  return BLACK_COLORS.some(black => black.toLowerCase() === normalized);
}

// Extract color from variant (checks attributes.color, attributes.farge, or variant name)
function extractColor(variant: any): string | null {
  const attrs = variant.attributes as Record<string, any> || {};
  
  // Check attributes.color or attributes.farge
  const colorFromAttrs = attrs.color || attrs.farge;
  if (colorFromAttrs) {
    return String(colorFromAttrs);
  }
  
  // Try to extract from variant name (e.g., "Rød - 2m" -> "Rød")
  const name = variant.name || '';
  const colorMatch = name.match(/^(Rød|Blå|Grønn|Gul|Hvit|Svart|Sort|Rosa|Lilla|Oransje|Brun|Grå|Red|Blue|Green|Yellow|White|Black|Pink|Purple|Orange|Brown|Grey|Gray)\s*-?/i);
  if (colorMatch) {
    return colorMatch[1];
  }
  
  return null;
}

interface CleanupStats {
  productsProcessed: number;
  variantsKept: number;
  variantsRemoved: number;
  productsWithOnlyNonBlack: number;
  productsFixed: string[];
}

async function cleanupColorVariants(dryRun: boolean = false, hardDelete: boolean = false): Promise<CleanupStats> {
  const stats: CleanupStats = {
    productsProcessed: 0,
    variantsKept: 0,
    variantsRemoved: 0,
    productsWithOnlyNonBlack: 0,
    productsFixed: [],
  };

  console.log('🔍 Starting color variant cleanup...\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : hardDelete ? 'HARD DELETE' : 'SOFT DELETE (isActive=false)'}\n`);

  // Get all products with their variants
  const products = await prisma.product.findMany({
    include: {
      variants: true,
    },
  });

  console.log(`Found ${products.length} products to process\n`);

  for (const product of products) {
    stats.productsProcessed++;
    
    if (!product.variants || product.variants.length === 0) {
      continue; // Skip products without variants
    }

    // Analyze variants by color
    const variantAnalysis = product.variants.map(variant => {
      const color = extractColor(variant);
      const isBlack = color ? isBlackColor(color) : false;
      return {
        variant,
        color,
        isBlack,
      };
    });

    const blackVariants = variantAnalysis.filter(v => v.isBlack);
    const nonBlackVariants = variantAnalysis.filter(v => !v.isBlack);
    const variantsWithoutColor = variantAnalysis.filter(v => !v.color);

    // Decision logic:
    // 1. If product has black variants, keep only those
    // 2. If product has only non-black variants, keep one and set it to black
    // 3. If variants have no color info, keep them (assume they're fine)

    if (blackVariants.length > 0) {
      // Case 1: Has black variants - remove all non-black
      console.log(`\n📦 ${product.name} (${product.id})`);
      console.log(`   ✅ Found ${blackVariants.length} black variant(s), removing ${nonBlackVariants.length} non-black variant(s)`);
      
      for (const { variant } of blackVariants) {
        stats.variantsKept++;
        console.log(`      ✓ Keeping: ${variant.name} (color: ${extractColor(variant) || 'none'})`);
      }

      for (const { variant, color } of nonBlackVariants) {
        stats.variantsRemoved++;
        console.log(`      ✗ Removing: ${variant.name} (color: ${color || 'unknown'})`);
        
        if (!dryRun) {
          if (hardDelete) {
            await prisma.productVariant.delete({
              where: { id: variant.id },
            });
            console.log(`        → Hard deleted`);
          } else {
            await prisma.productVariant.update({
              where: { id: variant.id },
              data: { isActive: false },
            });
            console.log(`        → Soft deleted (isActive=false)`);
          }
        }
      }

      // Also keep variants without color info (they might be size-only variants)
      for (const { variant } of variantsWithoutColor) {
        stats.variantsKept++;
        console.log(`      ✓ Keeping (no color): ${variant.name}`);
      }
    } else if (nonBlackVariants.length > 0 && blackVariants.length === 0) {
      // Case 2: Only non-black variants - keep first one and set to black
      stats.productsWithOnlyNonBlack++;
      const firstVariant = nonBlackVariants[0].variant;
      
      console.log(`\n📦 ${product.name} (${product.id})`);
      console.log(`   ⚠️  Only non-black variants found. Keeping first variant and setting color to black`);
      console.log(`      ✓ Keeping and fixing: ${firstVariant.name}`);
      
      stats.variantsKept++;
      
      // Update first variant to be black
      if (!dryRun) {
        const attrs = (firstVariant.attributes as Record<string, any>) || {};
        attrs.color = 'Svart';
        attrs.farge = 'Svart';
        
        await prisma.productVariant.update({
          where: { id: firstVariant.id },
          data: {
            attributes: attrs,
            isActive: true,
          },
        });
        console.log(`        → Updated color to "Svart"`);
      }

      // Remove other non-black variants
      for (let i = 1; i < nonBlackVariants.length; i++) {
        const { variant, color } = nonBlackVariants[i];
        stats.variantsRemoved++;
        console.log(`      ✗ Removing: ${variant.name} (color: ${color || 'unknown'})`);
        
        if (!dryRun) {
          if (hardDelete) {
            await prisma.productVariant.delete({
              where: { id: variant.id },
            });
            console.log(`        → Hard deleted`);
          } else {
            await prisma.productVariant.update({
              where: { id: variant.id },
              data: { isActive: false },
            });
            console.log(`        → Soft deleted (isActive=false)`);
          }
        }
      }

      stats.productsFixed.push(product.id);
    } else {
      // Case 3: Variants without color info - keep all (they're probably size-only)
      console.log(`\n📦 ${product.name} (${product.id})`);
      console.log(`   ℹ️  Variants have no color info - keeping all (assuming size-only variants)`);
      for (const { variant } of variantsWithoutColor) {
        stats.variantsKept++;
        console.log(`      ✓ Keeping: ${variant.name}`);
      }
    }
  }

  return stats;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const hardDelete = args.includes('--hard-delete');

  try {
    const stats = await cleanupColorVariants(dryRun, hardDelete);

    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Products processed:     ${stats.productsProcessed}`);
    console.log(`Variants kept:           ${stats.variantsKept}`);
    console.log(`Variants removed:        ${stats.variantsRemoved}`);
    console.log(`Products with only non-black (fixed): ${stats.productsWithOnlyNonBlack}`);
    console.log(`Products fixed:         ${stats.productsFixed.length}`);
    
    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else if (hardDelete) {
      console.log('\n⚠️  HARD DELETE MODE - Variants were permanently deleted');
    } else {
      console.log('\n✅ SOFT DELETE MODE - Variants were deactivated (isActive=false)');
      console.log('   You can review and manually delete them later if needed');
    }
    
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

