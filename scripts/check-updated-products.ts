import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("📊 Sjekker oppdaterte produkter...\n");

  const products = await prisma.product.findMany({
    where: { 
      supplierUrl: { not: null },
      isActive: true,
    },
    include: {
      variants: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  console.log(`Fant ${products.length} produkter med supplierUrl:\n`);

  let withImages = 0;
  let withVariants = 0;
  let withDescription = 0;

  products.forEach((product, index) => {
    const images = typeof product.images === "string" ? JSON.parse(product.images) : product.images || [];
    const hasImages = Array.isArray(images) && images.length > 0 && images[0]?.startsWith('http');
    const hasDescription = product.description && product.description.length > 50;
    const hasVariants = product.variants && product.variants.length > 0;
    
    if (hasImages) withImages++;
    if (hasVariants) withVariants++;
    if (hasDescription) withDescription++;

    console.log(`${index + 1}. ${product.name}`);
    console.log(`   Bilder: ${hasImages ? `✅ ${images.length} bilder` : "❌ Ingen bilder"}`);
    console.log(`   Beskrivelse: ${hasDescription ? `✅ ${product.description?.length || 0} tegn` : "❌ Mangler"}`);
    console.log(`   Varianter: ${hasVariants ? `✅ ${product.variants.length} varianter` : "❌ Ingen varianter"}`);
    if (hasVariants) {
      const variantNames = product.variants.slice(0, 3).map(v => v.name).join(", ");
      console.log(`   Variant-eksempler: ${variantNames}${product.variants.length > 3 ? "..." : ""}`);
    }
    console.log();
  });

  console.log("=".repeat(60));
  console.log("📊 STATISTIKK");
  console.log("=".repeat(60));
  console.log(`Total produkter: ${products.length}`);
  console.log(`Med bilder: ${withImages} (${Math.round(withImages / products.length * 100)}%)`);
  console.log(`Med beskrivelse: ${withDescription} (${Math.round(withDescription / products.length * 100)}%)`);
  console.log(`Med varianter: ${withVariants} (${Math.round(withVariants / products.length * 100)}%)`);
  console.log("=".repeat(60));
}

main()
  .catch((error) => {
    console.error("❌ Feil:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

