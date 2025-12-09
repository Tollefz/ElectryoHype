import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignVariantImages() {
  console.log('🔍 Assigning images to variants...\n');

  const products = await prisma.product.findMany({
    include: {
      variants: {
        where: { isActive: true },
      },
    },
  });

  let fixedCount = 0;
  let skippedCount = 0;

  for (const product of products) {
    if (!product.variants || product.variants.length === 0) {
      skippedCount++;
      continue;
    }

    let images: string[] = [];
    try {
      images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
    } catch {
      images = [];
    }

    if (images.length === 0) {
      skippedCount++;
      continue;
    }

    let needsUpdate = false;
    const variantUpdates: Array<{ id: string; image: string }> = [];

    // For each variant, assign the correct image
    product.variants.forEach((variant, index) => {
      const attrs = (variant.attributes as Record<string, string>) || {};
      const color = (attrs.color || attrs.farge || variant.name).toLowerCase();
      
      // Skip placeholder images
      const isPlaceholder = variant.image?.includes('placeholder') || 
                           variant.image?.includes('placehold.co') ||
                           !variant.image;
      
      // Find image by color name
      let assignedImage = variant.image;
      
      if (isPlaceholder || !assignedImage) {
        // Try to find image that matches color
        for (const img of images) {
          const imgLower = img.toLowerCase();
          if (imgLower.includes(color) || 
              (color.includes('svart') && imgLower.includes('black')) ||
              (color.includes('hvit') && imgLower.includes('white')) ||
              (color.includes('grå') && (imgLower.includes('gray') || imgLower.includes('grey')))) {
            assignedImage = img;
            break;
          }
        }
        
        // If no match found, use index-based assignment
        if (!assignedImage && images[index]) {
          assignedImage = images[index];
        } else if (!assignedImage && images[0]) {
          assignedImage = images[0];
        }
      }

      if (assignedImage && assignedImage !== variant.image) {
        variantUpdates.push({ id: variant.id, image: assignedImage });
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      // Update all variants
      for (const update of variantUpdates) {
        await prisma.productVariant.update({
          where: { id: update.id },
          data: { image: update.image },
        });
      }
      
      console.log(`✅ Fixed: ${product.name}`);
      console.log(`   Updated ${variantUpdates.length} variants\n`);
      fixedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Fixed: ${fixedCount} produkter`);
  console.log(`   Skipped: ${skippedCount} produkter`);
  console.log('✅ Done!');
}

assignVariantImages()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });

