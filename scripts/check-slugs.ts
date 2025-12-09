import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSlugs() {
  const products = await prisma.product.findMany({
    where: {
      name: { contains: '68' },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  console.log('Products with "68" in name:');
  products.forEach(p => {
    console.log(`\n${p.name}`);
    console.log(`Slug: ${p.slug}`);
  });
  
  await prisma.$disconnect();
}

checkSlugs();

