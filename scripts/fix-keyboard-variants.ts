import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixKeyboardVariants() {
  console.log('🔧 Fixing keyboard product variants...\n');

  // Find the keyboard product
  const product = await prisma.product.findFirst({
    where: {
      name: {
        contains: 'ultra thin usb powered ergonomisk tastatur',
      },
    },
    include: {
      variants: true,
    },
  });

  if (!product) {
    console.log('❌ Keyboard product not found');
    return;
  }

  let images: string[] = [];
  try {
    images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
  } catch {
    images = [];
  }

  console.log(`📦 Found product: ${product.name}`);
  console.log(`   Images: ${images.length}`);
  images.forEach((img, idx) => console.log(`     ${idx + 1}. ${img.substring(0, 80)}...`));

  if (product.variants && product.variants.length > 0) {
    console.log(`   Variants: ${product.variants.length}`);
    
    // Map: Svart = image 0, Hvit = image 1, Grå = image 2
    const colorMap: Record<string, number> = {
      'svart': 0,
      'hvit': 1,
      'grå': 2,
      'graa': 2,
    };

    for (const variant of product.variants) {
      const attrs = (variant.attributes as Record<string, string>) || {};
      const color = (attrs.color || attrs.farge || variant.name).toLowerCase();
      const colorIndex = colorMap[color];
      
      if (colorIndex !== undefined && images[colorIndex]) {
        const imageUrl = images[colorIndex];
        console.log(`   Updating ${variant.name} (${color}) with image ${colorIndex + 1}`);
        
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { image: imageUrl },
        });
      } else {
        console.log(`   ⚠️  No image mapping for ${variant.name} (${color})`);
      }
    }
  }

  console.log('\n✅ Done!');
}

fixKeyboardVariants()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });

