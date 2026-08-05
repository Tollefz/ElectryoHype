/**
 * Script to sanitize existing product descriptions in the database
 * Removes supplier references (Temu, Alibaba, eBay) and marketing filler
 * 
 * Usage: npm run sanitize:descriptions
 */

import { PrismaClient } from '@prisma/client';
import { sanitizeDescriptionWithFallback } from '../lib/import/sanitizeDescription';

const prisma = new PrismaClient();

async function sanitizeProductDescriptions() {
  console.log('🧹 Starting product description sanitization...\n');

  try {
    // Find products with supplier references in description or shortDescription
    // Search for: temu, alibaba, ebay, oppdag, discover, temu.com
    const products = await prisma.product.findMany({
      where: {
        OR: [
          {
            description: {
              contains: 'temu',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'alibaba',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'ebay',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'oppdag',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'discover',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'temu.com',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'temu',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'alibaba',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'ebay',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'oppdag',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'discover',
              mode: 'insensitive',
            },
          },
          {
            shortDescription: {
              contains: 'temu.com',
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
    const fallbackDescription = 'Dette produktet er en del av vårt utvalg av elektronikk og tilbehør. Vi leverer kvalitetsprodukter med fokus på funksjonalitet og verdi.';

    for (const product of products) {
      try {
        let needsUpdate = false;
        let newDescription = product.description;
        let newShortDescription = product.shortDescription;

        // Sanitize description if it exists
        if (product.description && product.description.trim().length > 0) {
          const sanitized = sanitizeDescriptionWithFallback(
            product.description,
            fallbackDescription
          );
          // Only update if sanitized result is different and not empty
          if (sanitized !== product.description && sanitized.trim().length > 0) {
            newDescription = sanitized;
            needsUpdate = true;
          }
        }

        // Sanitize shortDescription if it exists
        if (product.shortDescription && product.shortDescription.trim().length > 0) {
          const sanitized = sanitizeDescriptionWithFallback(
            product.shortDescription,
            product.shortDescription.length > 50 
              ? product.shortDescription.substring(0, 50) + '...'
              : product.shortDescription
          );
          // Only update if sanitized result is different and not empty
          if (sanitized !== product.shortDescription && sanitized.trim().length > 0) {
            newShortDescription = sanitized;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              description: newDescription || product.description,
              shortDescription: newShortDescription || product.shortDescription,
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
