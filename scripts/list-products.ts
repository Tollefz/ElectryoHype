import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("📦 Lister alle aktive produkter i databasen...\n");

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      supplierUrl: true,
      images: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  console.log(`Fant ${products.length} produkter:\n`);
  
  products.forEach((product, index) => {
    const images = typeof product.images === "string" ? JSON.parse(product.images) : product.images || [];
    const hasImages = Array.isArray(images) && images.length > 0;
    const imageCount = Array.isArray(images) ? images.length : 0;
    
    console.log(`${index + 1}. ${product.name}`);
    console.log(`   Kategori: ${product.category || "N/A"}`);
    console.log(`   Pris: ${product.price} kr`);
    console.log(`   Bilder: ${imageCount} (${hasImages ? "✅" : "❌"})`);
    console.log(`   URL: ${product.supplierUrl ? "✅" : "❌"}`);
    console.log();
  });
}

main()
  .catch((error) => {
    console.error("❌ Feil:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

