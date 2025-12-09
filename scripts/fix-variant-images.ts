import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixVariantImages() {
  console.log('🔍 Starting variant image fix...\n');

  const products = await prisma.product.findMany({
    include: {
      variants: true,
    },
  });

  let fixedCount = 0;
  let skippedCount = 0;

  for (const product of products) {
    let images: string[] = [];
    let tags: string[] = [];

    try {
      images = typeof product.images === 'string' 
        ? JSON.parse(product.images) 
        : (product.images || []);
    } catch {
      images = [];
    }

    try {
      tags = typeof product.tags === 'string' 
        ? JSON.parse(product.tags) 
        : (product.tags || []);
    } catch {
      tags = [];
    }

    // Check if product has variants in database
    const hasDbVariants = product.variants && product.variants.length > 0;

    // Detect color variants from tags (fallback)
    const colorTags = tags.filter((tag: string) =>
      ['svart', 'hvit', 'grå', 'rød', 'blå', 'grønn', 'gul', 'rosa', 'lilla', 'oransje', 'brun', 
       'black', 'white', 'gray', 'grey', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown']
      .some(c => tag.toLowerCase().includes(c))
    );

    // Use database variants if available, otherwise use tags
    const variantCount = hasDbVariants ? product.variants.length : colorTags.length;

    if (variantCount > 1 && images.length < variantCount) {
      console.log(`⚠️  ${product.name}:`);
      console.log(`   ${variantCount} varianter men bare ${images.length} bilder`);
      
      // Generate placeholder images for missing variants
      const newImages = [...images];
      
      for (let i = images.length; i < variantCount; i++) {
        const variantName = hasDbVariants 
          ? product.variants[i]?.name || `Variant ${i + 1}`
          : colorTags[i] || `Variant ${i + 1}`;
        
        const placeholderUrl = `https://placehold.co/600x600/e2e8f0/64748b?text=${encodeURIComponent(variantName + ' - ' + product.name.substring(0, 30))}`;
        newImages.push(placeholderUrl);
      }

      await prisma.product.update({
        where: { id: product.id },
        data: {
          images: JSON.stringify(newImages),
        },
      });

      console.log(`✅ Fixed: Added ${newImages.length - images.length} placeholder images\n`);
      fixedCount++;
    } else if (variantCount > 1) {
      console.log(`✓ ${product.name}: OK (${variantCount} varianter, ${images.length} bilder)\n`);
      skippedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Fixed: ${fixedCount} produkter`);
  console.log(`   Skipped: ${skippedCount} produkter`);
  console.log('✅ Done!');
}

fixVariantImages()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });

