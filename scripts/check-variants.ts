import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkVariants() {
  console.log('🔍 Checking product variants...\n');

  const products = await prisma.product.findMany({
    include: {
      variants: {
        where: { isActive: true },
      },
    },
    take: 5, // Check first 5 products
  });

  for (const product of products) {
    let images: string[] = [];
    try {
      images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
    } catch {
      images = [];
    }

    console.log(`\n📦 ${product.name}`);
    console.log(`   Product images: ${images.length}`);
    if (images.length > 0) {
      images.forEach((img, idx) => {
        console.log(`     ${idx + 1}. ${img.substring(0, 80)}...`);
      });
    }

    if (product.variants && product.variants.length > 0) {
      console.log(`   Variants: ${product.variants.length}`);
      product.variants.forEach((variant, idx) => {
        const attrs = (variant.attributes as Record<string, string>) || {};
        const color = attrs.color || attrs.farge || variant.name;
        console.log(`     ${idx + 1}. ${variant.name}`);
        console.log(`        Color: ${color}`);
        console.log(`        Image: ${variant.image || 'INGEN BILDE'}`);
        console.log(`        Price: ${variant.price}`);
      });
    } else {
      console.log(`   Variants: INGEN VARIANTER`);
    }
  }

  console.log('\n✅ Done!');
}

checkVariants()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });

