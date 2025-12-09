/**
 * Script to improve product titles
 * 
 * This script:
 * 1. Reads all products
 * 2. Generates improved titles based on rules:
 *    - Short, clear, professional (3-8 words)
 *    - Remove unnecessary/repetitive words
 *    - Remove technical specs (belong in description)
 *    - Remove geographical words (Vietnam/Kinesisk/Cherry kompatibel)
 *    - Remove model IDs (G601099600944889)
 *    - Keep important attributes: size, type, variant, switches, color
 * 3. Logs old → new title for review
 * 4. Updates all product titles
 * 
 * Usage:
 *   npm run ts-node scripts/improve-product-titles.ts
 *   npm run ts-node scripts/improve-product-titles.ts -- --dry-run
 */

import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return slugify(title, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g,
  })
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Patterns to remove from titles
const REMOVE_PATTERNS: Array<[RegExp, string]> = [
  // Model IDs (G followed by numbers)
  [/\bG\d{12,}\b/gi, ''],
  // Geographical references
  [/\b(Vietnam|Kinesisk|Chinese|Cherry\s+kompatibel|kompatibelt\s+med\s+cherry)\b/gi, ''],
  [/\b(Temu\s+Norway|Temu|Alibaba|eBay)\b/gi, ''],
  // Redundant phrases
  [/\b(For\s+bedrift|For\s+home|For\s+office)\b/gi, ''],
  [/\b(Inkludert|Included|Kompatibel|Compatible)\b/gi, ''],
  [/\b(Stasjonær\s+datamaskin|Bærbar\s+pc|Desktop|Laptop)\b/gi, ''],
  // Technical specs that belong in description
  [/\b(RGB\s+bakgrunnsbelyst|RGB\s+backlit|LED\s+lighting)\b/gi, ''],
  [/\b(USB\s+til\s+USB|USB\s+to\s+USB)\b/gi, 'USB'],
  // Redundant words
  [/\b(Produkt|Product)\b/gi, ''],
  [/\b(Handle|Sjekk\s+ut|Finn)\b/gi, ''],
  // Multiple spaces
  [/\s+/g, ' '],
];

// Patterns to normalize
const NORMALIZE_PATTERNS: Array<[RegExp, string]> = [
  // Keyboard sizes
  [/\b(\d+)\s*-\s*taster\b/gi, '$1-taster'],
  [/\b(\d+)\s*%\s*tastatur\b/gi, '$1% tastatur'],
  [/\bMini\s+(\d+)\b/gi, '$1-taster'],
  // Common abbreviations
  [/\bUSB\s*-\s*C\b/gi, 'USB-C'],
  [/\bType\s*-\s*C\b/gi, 'Type-C'],
  [/\bHDTV\b/gi, 'HDMI'],
  [/\bHDMI\s*-\s*kabel\b/gi, 'HDMI-kabel'],
  // Switch types
  [/\b(Blå|Rød|Brun|Grønn)\s+brytere?\b/gi, '($1 brytere)'],
  [/\b(Blue|Red|Brown|Green)\s+switches?\b/gi, '($1 brytere)'],
  // Common product types
  [/\bSpilltastatur\b/gi, 'Gaming-tastatur'],
  [/\bSpillmus\b/gi, 'Gaming-mus'],
  [/\bTrådløst\s+tastatur\b/gi, 'Trådløst tastatur'],
  [/\bTrådløs\s+mus\b/gi, 'Trådløs mus'],
  [/\bMekanisk\s+tastatur\b/gi, 'Mekanisk tastatur'],
  [/\bErgonomisk\s+mus\b/gi, 'Ergonomisk mus'],
  [/\bHurtiglader\b/gi, 'Hurtiglader'],
  [/\bLadekabel\b/gi, 'Ladekabel'],
  [/\bLaderkabel\b/gi, 'Ladekabel'],
  [/\bUSB\s+c\s+til\s+lightning\b/gi, 'USB-C til Lightning'],
  [/\bType\s+c\s+til\s+lightning\b/gi, 'Type-C til Lightning'],
];

/**
 * Extract key product attributes from title
 */
function extractProductInfo(title: string): {
  type: string;
  size?: string;
  switches?: string;
  color?: string;
  variant?: string;
} {
  const lower = title.toLowerCase();
  
  // Product type
  let type = '';
  if (lower.includes('tastatur') || lower.includes('keyboard')) {
    type = 'tastatur';
  } else if (lower.includes('mus') || lower.includes('mouse')) {
    type = 'mus';
  } else if (lower.includes('lader') || lower.includes('charger')) {
    type = 'lader';
  } else if (lower.includes('kabel') || lower.includes('cable')) {
    type = 'kabel';
  } else if (lower.includes('brakett') || lower.includes('bracket')) {
    type = 'brakett';
  } else if (lower.includes('veske') || lower.includes('bag')) {
    type = 'veske';
  }
  
  // Size (for keyboards)
  let size: string | undefined;
  const sizeMatch = title.match(/\b(\d+)[\s-]*(taster|%|keys)\b/i);
  if (sizeMatch) {
    size = `${sizeMatch[1]}-taster`;
  }
  
  // Switches
  let switches: string | undefined;
  const switchMatch = title.match(/\b(Blå|Rød|Brun|Grønn|Blue|Red|Brown|Green)\s+brytere?/i);
  if (switchMatch) {
    switches = switchMatch[1];
  }
  
  // Color (if not black, since we only have black now)
  let color: string | undefined;
  if (lower.includes('svart') || lower.includes('black')) {
    color = 'Svart';
  }
  
  return { type, size, switches, color };
}

/**
 * Generate improved title from original
 */
function improveTitle(original: string): string {
  if (!original || original.trim().length === 0) {
    return original;
  }
  
  let improved = original.trim();
  const originalLower = original.toLowerCase();
  
  // Step 1: Remove unwanted patterns
  for (const [pattern, replacement] of REMOVE_PATTERNS) {
    improved = improved.replace(pattern, replacement);
  }
  
  // Step 2: Normalize patterns
  for (const [pattern, replacement] of NORMALIZE_PATTERNS) {
    improved = improved.replace(pattern, replacement);
  }
  
  // Step 3: Extract key info and rebuild
  const info = extractProductInfo(improved);
  
  // Step 4: Build new title based on product type
  let newTitle = '';
  
  if (info.type === 'tastatur') {
    // Format: "X-taster Mekanisk/Gaming Tastatur (Blå brytere)"
    const parts: string[] = [];
    
    if (info.size) {
      parts.push(info.size);
    }
    
    // Check if mechanical or gaming
    const lower = improved.toLowerCase();
    const originalLower = original.toLowerCase();
    
    if (lower.includes('mekanisk') || lower.includes('mechanical')) {
      parts.push('Mekanisk');
    } else if (lower.includes('gaming') || lower.includes('spill') || originalLower.includes('rgb')) {
      parts.push('Gaming');
    } else if (lower.includes('trådløs') || lower.includes('wireless')) {
      parts.push('Trådløst');
    } else if (lower.includes('ergonomisk') || lower.includes('ergonomic')) {
      parts.push('Ergonomisk');
    } else if (lower.includes('ultra') || lower.includes('tynn') || lower.includes('thin')) {
      parts.push('Ultra-tynt');
    }
    
    // Add specific features to make unique
    if (originalLower.includes('rgb') || originalLower.includes('lysende') || originalLower.includes('backlit')) {
      parts.push('RGB');
    }
    if (originalLower.includes('mini') || originalLower.includes('60%') || originalLower.includes('shrink')) {
      if (!info.size) {
        parts.push('Mini');
      }
    }
    // Check if it's a keyboard + mouse set
    const isKeyboardSet = originalLower.includes('musesett') || 
                          originalLower.includes('keyboard set') || 
                          originalLower.includes('tastatur og mus') || 
                          originalLower.includes('tastatur og musekombo') ||
                          originalLower.includes('tastatur og musekombo');
    
    if (isKeyboardSet) {
      // Format: "Trådløst Tastatur og Mus"
      parts.push('Tastatur og Mus');
    } else {
      parts.push('tastatur');
    }
    
    if (info.switches) {
      parts.push(`(${info.switches} brytere)`);
    }
    
    newTitle = parts.join(' ');
  } else if (info.type === 'mus') {
    // Format: "Trådløs Gaming-mus" or "Ergonomisk Mus"
    const parts: string[] = [];
    
    const lower = improved.toLowerCase();
    if (lower.includes('trådløs') || lower.includes('wireless')) {
      parts.push('Trådløs');
    }
    if (lower.includes('gaming') || lower.includes('spill')) {
      parts.push('Gaming');
    }
    if (lower.includes('ergonomisk') || lower.includes('ergonomic')) {
      parts.push('Ergonomisk');
    }
    
    parts.push('mus');
    newTitle = parts.join(' ');
  } else if (info.type === 'kabel') {
    // Format: "USB-C Ladekabel 2m" or "HDMI-kabel 2m"
    const parts: string[] = [];
    
    const lower = improved.toLowerCase();
    const originalLower = original.toLowerCase();
    
    // Check for specific cable types
    if (lower.includes('lightning')) {
      if (lower.includes('usb-c') || lower.includes('type-c')) {
        parts.push('USB-C');
      } else {
        parts.push('USB');
      }
      parts.push('til Lightning');
    } else if (lower.includes('usb-c') || lower.includes('type-c')) {
      parts.push('USB-C');
    } else if (lower.includes('hdmi') || lower.includes('hdtv')) {
      parts.push('HDMI');
    } else if (lower.includes('usb')) {
      parts.push('USB');
    }
    
    // Check for multi-cable (3-in-1, etc.)
    const multiMatch = original.match(/\b(\d+)\s*[-i]\s*1\b/i);
    if (multiMatch) {
      parts.push(`${multiMatch[1]}-i-1`);
    }
    
    // Add specific features
    if (originalLower.includes('flettet') || originalLower.includes('braided')) {
      parts.push('Flettet');
    }
    if (originalLower.includes('superlang') || originalLower.includes('super long')) {
      parts.push('Superlang');
    }
    
    if (lower.includes('lade') || lower.includes('charge') || lower.includes('hurtig')) {
      parts.push('Ladekabel');
    } else if (lower.includes('data') || lower.includes('synkron')) {
      parts.push('Datakabel');
    } else {
      parts.push('kabel');
    }
    
    // Add length if mentioned (prioritize longest, but include if multiple)
    const lengthMatches = original.match(/\b(\d+\.?\d*)\s*m\b/gi);
    if (lengthMatches && lengthMatches.length > 0) {
      const lengths = lengthMatches.map(m => parseFloat(m.replace(/\s*m/gi, '')));
      const longestLength = Math.max(...lengths);
      if (longestLength > 0) {
        parts.push(longestLength + 'm');
      }
    } else {
      // Try to find length in feet
      const feetMatch = original.match(/\b(\d+\.?\d*)\s*ft\b/i);
      if (feetMatch) {
        const feet = parseFloat(feetMatch[1]);
        const meters = (feet * 0.3048).toFixed(1);
        parts.push(meters + 'm');
      }
    }
    
    // Add power/speed if mentioned
    const powerMatch = original.match(/\b(\d+)\s*w\b/i);
    if (powerMatch) {
      parts.push(powerMatch[1] + 'W');
    }
    
    newTitle = parts.join(' ');
  } else if (info.type === 'lader') {
    // Format: "USB-C Hurtiglader 60W" or "Laderstativ 15W"
    const parts: string[] = [];
    
    const lower = improved.toLowerCase();
    const originalLower = original.toLowerCase();
    
    // Check if it's a stand/dock
    if (lower.includes('stativ') || lower.includes('stand') || lower.includes('dock')) {
      parts.push('Laderstativ');
    } else {
      // Check original for USB-C even if cleaned version doesn't have it
      if (originalLower.includes('usb-c') || originalLower.includes('type-c') || originalLower.includes('usb c')) {
        parts.push('USB-C');
      } else if (lower.includes('usb-c') || lower.includes('type-c')) {
        parts.push('USB-C');
      } else if (lower.includes('usb') || originalLower.includes('usb')) {
        parts.push('USB');
      }
      
      if (lower.includes('hurtig') || lower.includes('fast') || originalLower.includes('hurtig')) {
        parts.push('Hurtiglader');
      } else {
        parts.push('Lader');
      }
    }
    
    // Add power if mentioned
    const powerMatch = original.match(/\b(\d+)\s*w\b/i);
    if (powerMatch) {
      parts.push(powerMatch[1] + 'W');
    }
    
    // Add port count if mentioned
    const portMatch = original.match(/\b(\d+)\s*ports?\b/i);
    if (portMatch) {
      parts.push(`${portMatch[1]} porter`);
    }
    
    // Add PD version if mentioned
    if (originalLower.includes('pd') || originalLower.includes('power delivery')) {
      const pdMatch = original.match(/\bpd\s*(\d+\.?\d*)\b/i);
      if (pdMatch) {
        parts.push(`PD${pdMatch[1]}`);
      } else {
        parts.push('PD');
      }
    }
    
    newTitle = parts.join(' ');
  } else if (info.type === 'veske') {
    // Format: "Lær Skulderveske" or "Håndveske"
    const parts: string[] = [];
    const lower = improved.toLowerCase();
    
    if (lower.includes('lær') || lower.includes('leather')) {
      parts.push('Lær');
    }
    if (lower.includes('skulder') || lower.includes('shoulder')) {
      parts.push('skulderveske');
    } else if (lower.includes('hånd') || lower.includes('hand')) {
      parts.push('håndveske');
    } else {
      parts.push('veske');
    }
    
    newTitle = parts.join(' ');
  } else if (info.type === 'brakett') {
    // Format: "Mobiltelefonbrakett" or "Nettbrettbrakett"
    const parts: string[] = [];
    const lower = improved.toLowerCase();
    
    if (lower.includes('mobil') || lower.includes('phone')) {
      parts.push('Mobiltelefonbrakett');
    } else if (lower.includes('nettbrett') || lower.includes('tablet')) {
      parts.push('Nettbrettbrakett');
    } else {
      parts.push('Brakett');
    }
    
    newTitle = parts.join(' ');
  } else {
    // For other product types, use simplified version
    // Remove all the patterns we identified, then clean up
    newTitle = improved
      .split(' ')
      .filter(word => {
        const w = word.toLowerCase();
        // Remove common filler words
        return !['for', 'med', 'til', 'og', 'eller', 'kompatibel', 'kompatibelt', 'temu', 'norway'].includes(w);
      })
      .slice(0, 8) // Max 8 words
      .join(' ');
  }
  
  // Final cleanup
  newTitle = newTitle
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*,/g, ',')
    .replace(/\s*\(\s*\)/g, '')
    .trim();
  
  // Capitalize first letter
  if (newTitle.length > 0) {
    newTitle = newTitle.charAt(0).toUpperCase() + newTitle.slice(1);
  }
  
  // If result is too short or empty, return a simplified version of original
  if (newTitle.length < 5 || newTitle.split(' ').length < 2) {
    // Fallback: just remove the worst offenders and take meaningful words
    newTitle = original
      .replace(/\bG\d{12,}\b/gi, '')
      .replace(/\b(Temu\s+Norway|Vietnam|Kinesisk|Cherry\s+kompatibel)\b/gi, '')
      .replace(/\b(For\s+Iphone|For\s+Samsung|Kompatibel\s+med)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Take first meaningful words (skip common fillers)
    const words = newTitle
      .split(' ')
      .filter(w => {
        const lower = w.toLowerCase();
        return !['for', 'med', 'til', 'og', 'eller', 'kompatibel'].includes(lower);
      })
      .slice(0, 6);
    
    newTitle = words.join(' ');
    
    // If still too short, use original with minimal cleanup
    if (newTitle.length < 5) {
      newTitle = original
        .replace(/\bG\d{12,}\b/gi, '')
        .replace(/\bTemu\s+Norway\b/gi, '')
        .split(' ')
        .slice(0, 6)
        .join(' ');
    }
  }
  
  // Remove duplicate words
  const words = newTitle.split(' ');
  const uniqueWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      uniqueWords.push(words[i]);
    }
  }
  newTitle = uniqueWords.join(' ');
  
  // Final validation: if title is too generic (just "Kabel", "Tastatur", etc.), 
  // add more context from original
  const genericTitles = ['kabel', 'tastatur', 'mus', 'lader', 'veske', 'brakett'];
  const newTitleLower = newTitle.toLowerCase();
  const isTooGeneric = genericTitles.some(gen => 
    newTitleLower === gen || 
    (newTitleLower.startsWith(gen + ' ') && newTitle.split(' ').length < 3)
  );
  
  if (isTooGeneric) {
    // Add more context from original title
    const originalWords = original
      .replace(/\bG\d{12,}\b/gi, '')
      .replace(/\b(Temu\s+Norway|Vietnam|Kinesisk|Cherry\s+kompatibel)\b/gi, '')
      .replace(/\b(For\s+Iphone|For\s+Samsung|Kompatibel\s+med)\b/gi, '')
      .split(' ')
      .filter(w => {
        const lower = w.toLowerCase();
        return !['for', 'med', 'til', 'og', 'eller', 'kompatibel', 'kompatibelt', 'temu', 'norway'].includes(lower) &&
               w.length > 2 &&
               !lower.match(/^g\d+$/); // Exclude model IDs
      })
      .slice(0, 6);
    
    // Merge with new title, avoiding duplicates
    const existingWords = newTitle.toLowerCase().split(' ');
    const additionalWords = originalWords
      .filter(w => {
        const wLower = w.toLowerCase();
        return !existingWords.some(ex => ex === wLower || wLower.includes(ex) || ex.includes(wLower));
      })
      .slice(0, 4);
    
    if (additionalWords.length > 0) {
      newTitle = (newTitle + ' ' + additionalWords.join(' '))
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // If still too generic, use a smarter approach - extract key distinguishing features
    if (newTitle.split(' ').length < 3) {
      // Try to find distinguishing features
      const originalLower = original.toLowerCase();
      
      // For cables: add type, length, or special features
      if (info.type === 'kabel') {
        if (originalLower.includes('flettet') || originalLower.includes('braided')) {
          newTitle = newTitle.replace('kabel', 'Flettet kabel');
        }
        if (originalLower.includes('superlang') || originalLower.includes('super long')) {
          newTitle = 'Superlang ' + newTitle;
        }
        if (originalLower.includes('datasynkron') || originalLower.includes('data sync')) {
          newTitle = newTitle.replace('kabel', 'Datakabel');
        }
      }
      
      // For keyboards: add size or type if missing
      if (info.type === 'tastatur' && !info.size) {
        const sizeMatch = original.match(/\b(\d+)\s*(taster|%|keys)\b/i);
        if (sizeMatch) {
          newTitle = `${sizeMatch[1]}-taster ${newTitle}`;
        }
      }
    }
  }
  
  return newTitle;
}

interface ImprovementStats {
  productsProcessed: number;
  titlesUpdated: number;
  titlesUnchanged: number;
}

async function improveTitles(dryRun: boolean = false): Promise<ImprovementStats> {
  const stats: ImprovementStats = {
    productsProcessed: 0,
    titlesUpdated: 0,
    titlesUnchanged: 0,
  };

  console.log('🔍 Starting product title improvement...\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (updating database)'}\n`);

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  console.log(`Found ${products.length} products to process\n`);

  for (const product of products) {
    stats.productsProcessed++;
    
    const originalTitle = product.name;
    const originalSlug = product.slug;
    
    // Get original title from description or shortDescription if name is too generic
    // This helps us improve titles that were already "improved" but became too generic
    let improvedTitle = improveTitle(originalTitle);
    
    // Check if current title is too generic and needs improvement
    const genericPatterns = [
      /^USB\s+Ladekabel$/i,
      /^USB\s+kabel$/i,
      /^HDMI\s+kabel$/i,
      /^Kabel$/i,
      /^Tastatur$/i,
      /^Trådløst\s+tastatur$/i,
    ];
    
    const isGeneric = genericPatterns.some(pattern => pattern.test(originalTitle));
    
    // If title is generic, try to get more info from product data
    if (isGeneric) {
      const productFull = await prisma.product.findUnique({
        where: { id: product.id },
        select: {
          name: true,
          shortDescription: true,
          description: true,
        },
      });
      
      if (productFull) {
        // Use description to improve generic title - combine all available text
        const allText = [
          productFull.name,
          productFull.shortDescription,
          productFull.description,
        ]
          .filter(Boolean)
          .join(' ')
          .substring(0, 300); // Limit to avoid processing too much
        
        improvedTitle = improveTitle(allText);
      }
    }
    
    // Always generate new slug from current title (even if title didn't change)
    const newSlug = generateSlug(improvedTitle);
    const slugNeedsUpdate = newSlug !== originalSlug;
    
    if (improvedTitle !== originalTitle || slugNeedsUpdate) {
      if (improvedTitle !== originalTitle) {
        stats.titlesUpdated++;
      }
      
      console.log(`\n📦 Product ID: ${product.id.substring(0, 20)}...`);
      if (improvedTitle !== originalTitle) {
        console.log(`   ❌ OLD Title: ${originalTitle}`);
        console.log(`   ✅ NEW Title: ${improvedTitle}`);
      }
      if (slugNeedsUpdate) {
        console.log(`   ❌ OLD Slug: ${originalSlug}`);
        console.log(`   ✅ NEW Slug: ${newSlug}`);
      }
      
      if (!dryRun) {
        // Check if slug already exists (for another product)
        const existingProduct = await prisma.product.findUnique({
          where: { slug: newSlug },
          select: { id: true },
        });
        
        let finalSlug = newSlug;
        
        // If slug exists for another product, append product ID to make it unique
        if (existingProduct && existingProduct.id !== product.id) {
          finalSlug = `${newSlug}-${product.id.substring(0, 8)}`;
          console.log(`      ⚠️  Slug conflict - using: ${finalSlug}`);
        }
        
        await prisma.product.update({
          where: { id: product.id },
          data: {
            name: improvedTitle,
            slug: finalSlug,
          },
        });
        
        console.log(`      → Updated in database`);
      }
    } else {
      stats.titlesUnchanged++;
      // Only log if title is already good (optional - comment out to reduce noise)
      // console.log(`✓ ${originalTitle.substring(0, 60)}... (no change needed)`);
    }
  }

  return stats;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    const stats = await improveTitles(dryRun);

    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPROVEMENT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Products processed:  ${stats.productsProcessed}`);
    console.log(`Titles updated:      ${stats.titlesUpdated}`);
    console.log(`Titles unchanged:    ${stats.titlesUnchanged}`);
    
    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Product titles have been improved and updated');
    }
    
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error during improvement:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

