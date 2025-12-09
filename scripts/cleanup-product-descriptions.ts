/**
 * Cleanup script for product descriptions
 * 
 * This script:
 * 1. Removes HTML tags and inline styles
 * 2. Normalizes formatting (removes redundant whitespace)
 * 3. Fixes obvious typos
 * 4. Ensures descriptions are clear and concise
 * 5. Keeps product-specific details intact
 * 
 * Usage:
 *   npm run ts-node scripts/cleanup-product-descriptions.ts
 *   npm run ts-node scripts/cleanup-product-descriptions.ts -- --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Remove HTML tags and decode HTML entities
function stripHtml(html: string): string {
  if (!html) return '';
  
  // Decode common HTML entities
  let text = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Remove inline styles and scripts
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Normalize whitespace
  text = text
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .replace(/\n\s*\n/g, '\n\n') // Multiple newlines to double
    .trim();
  
  return text;
}

// Clean and normalize description text
function cleanDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  
  let cleaned = text.trim();
  
  // Remove HTML
  cleaned = stripHtml(cleaned);
  
  // Remove redundant filler phrases
  const fillerPhrases = [
    /^lorem ipsum/gi,
    /^dummy text/gi,
    /^placeholder text/gi,
    /\blorem ipsum\b/gi,
    /\bdummy text\b/gi,
    /\bplaceholder\b/gi,
  ];
  
  fillerPhrases.forEach(phrase => {
    cleaned = cleaned.replace(phrase, '');
  });
  
  // Fix common formatting issues
  cleaned = cleaned
    .replace(/\s*\.\s*\.\s*\./g, '...') // Normalize ellipsis
    .replace(/\s*,\s*,/g, ',') // Remove double commas
    .replace(/\s*\.\s*\./g, '.') // Fix double periods
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .trim();
  
  // Remove empty paragraphs or sections
  const lines = cleaned.split('\n').filter(line => line.trim().length > 0);
  cleaned = lines.join('\n\n');
  
  // If result is too short or just whitespace, return null
  if (cleaned.length < 10) {
    return null;
  }
  
  return cleaned;
}

// Fix obvious typos (Norwegian context)
function fixTypos(text: string): string {
  if (!text) return text;
  
  // Common Norwegian typos
  const fixes: [RegExp, string][] = [
    [/produkt\s+produkt/gi, 'produkt'], // Duplicate word
    [/beskrivelse\s+beskrivelse/gi, 'beskrivelse'],
    [/kvalitet\s+kvalitet/gi, 'kvalitet'],
    [/\b(\w+)\s+\1\b/gi, '$1'], // Remove duplicate words
  ];
  
  let fixed = text;
  fixes.forEach(([pattern, replacement]) => {
    fixed = fixed.replace(pattern, replacement);
  });
  
  return fixed;
}

interface CleanupStats {
  productsProcessed: number;
  descriptionsUpdated: number;
  shortDescriptionsUpdated: number;
  descriptionsRemoved: number;
}

async function cleanupDescriptions(dryRun: boolean = false): Promise<CleanupStats> {
  const stats: CleanupStats = {
    productsProcessed: 0,
    descriptionsUpdated: 0,
    shortDescriptionsUpdated: 0,
    descriptionsRemoved: 0,
  };

  console.log('🔍 Starting product description cleanup...\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (updating database)'}\n`);

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      shortDescription: true,
    },
  });

  console.log(`Found ${products.length} products to process\n`);

  for (const product of products) {
    stats.productsProcessed++;
    
    let needsUpdate = false;
    const updates: { description?: string | null; shortDescription?: string | null } = {};
    
    // Clean description
    if (product.description) {
      const original = product.description;
      let cleaned = cleanDescription(original);
      
      if (cleaned) {
        cleaned = fixTypos(cleaned);
      }
      
      if (cleaned !== original) {
        if (cleaned === null) {
          console.log(`\n📦 ${product.name.substring(0, 60)}...`);
          console.log(`   ❌ Description will be removed (was empty/invalid)`);
          updates.description = null;
          stats.descriptionsRemoved++;
        } else {
          console.log(`\n📦 ${product.name.substring(0, 60)}...`);
          console.log(`   ✏️  Description updated:`);
          console.log(`      Before: ${original.substring(0, 80)}...`);
          console.log(`      After:  ${cleaned.substring(0, 80)}...`);
          updates.description = cleaned;
          stats.descriptionsUpdated++;
        }
        needsUpdate = true;
      }
    }
    
    // Clean shortDescription
    if (product.shortDescription) {
      const original = product.shortDescription;
      let cleaned = cleanDescription(original);
      
      if (cleaned) {
        cleaned = fixTypos(cleaned);
        // Short descriptions should be max 200 chars
        if (cleaned.length > 200) {
          cleaned = cleaned.substring(0, 197) + '...';
        }
      }
      
      if (cleaned !== original) {
        if (!needsUpdate) {
          console.log(`\n📦 ${product.name.substring(0, 60)}...`);
        }
        console.log(`   ✏️  Short description updated:`);
        console.log(`      Before: ${original.substring(0, 60)}...`);
        console.log(`      After:  ${cleaned ? cleaned.substring(0, 60) + '...' : '(removed)'}`);
        updates.shortDescription = cleaned;
        stats.shortDescriptionsUpdated++;
        needsUpdate = true;
      }
    }
    
    // Update database
    if (needsUpdate && !dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: updates,
      });
    }
  }

  return stats;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    const stats = await cleanupDescriptions(dryRun);

    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Products processed:        ${stats.productsProcessed}`);
    console.log(`Descriptions updated:      ${stats.descriptionsUpdated}`);
    console.log(`Short descriptions updated: ${stats.shortDescriptionsUpdated}`);
    console.log(`Descriptions removed:      ${stats.descriptionsRemoved}`);
    
    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Descriptions have been cleaned and updated');
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

