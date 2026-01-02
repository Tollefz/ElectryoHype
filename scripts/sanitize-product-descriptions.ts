/**
 * Script to sanitize existing product descriptions in the database
 * Removes supplier references (Temu, Alibaba, eBay) and marketing filler
 * 
 * Usage: npm run sanitize:descriptions
 */

import { prisma } from '../lib/prisma';
import { sanitizeDescriptionWithFallback } from '../lib/import/sanitizeDescription';

async function sanitizeProductDescriptions() {
  console.log('🧹 Starting product description sanitization...\n');

  try {
    // Find products with supplier references in description or shortDescription
    const products = await prisma.product.findMany({
      where: {
        OR: [
          {
            description: {
              contains: 'Temu',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'Alibaba',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'eBay',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'Oppdag flere',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'Temu',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'Alibaba',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'eBay',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'Oppdag flere',
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        shortDescription: true,
      },
    });

    console.log(`📦 Found ${products.length} products to sanitize\n`);

    if (products.length === 0) {
      console.log('✅ No products need sanitization. All descriptions are clean!');
      return;
    }

    let updated = 0;
    let skipped = 0;

    for (const product of products) {
      try {
        let needsUpdate = false;
        let newDescription = product.description;
        let newShortDescription = product.shortDescription;

        // Sanitize description if it exists
        if (product.description) {
          const sanitized = sanitizeDescriptionWithFallback(
            product.description,
            product.description // Keep original if sanitization removes too much
          );
          if (sanitized !== product.description) {
            newDescription = sanitized;
            needsUpdate = true;
          }
        }

        // Sanitize shortDescription if it exists
        if (product.shortDescription) {
          const sanitized = sanitizeDescriptionWithFallback(
            product.shortDescription,
            product.shortDescription // Keep original if sanitization removes too much
          );
          if (sanitized !== product.shortDescription) {
            newShortDescription = sanitized;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              description: newDescription,
              shortDescription: newShortDescription,
            },
          });
          updated++;
          console.log(`✅ Updated: ${product.name} (${product.slug})`);
        } else {
          skipped++;
          console.log(`⏭️  Skipped: ${product.name} (${product.slug}) - no changes needed`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${product.name} (${product.slug}):`, error);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📦 Total processed: ${products.length}`);
    console.log('\n✨ Sanitization complete!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
sanitizeProductDescriptions();

