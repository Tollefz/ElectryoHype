/**
 * Quick script to check current product titles
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTitles() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  console.log(`Found ${products.length} products:\n`);
  products.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
  });
  
  await prisma.$disconnect();
}

checkTitles();

