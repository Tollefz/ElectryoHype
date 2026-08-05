import { PrismaClient, Prisma } from '@prisma/client';
import { TemuScraper } from '../lib/scrapers/temu-scraper';

const prisma = new PrismaClient();

type VariantCreateInput = Prisma.ProductVariantCreateManyInput;

async function updateProduct(productName: string) {
  try {
    console.log(`🔍 Søker etter produkt: "${productName}"...`);
    
    // Finn produktet i databasen
    const product = await prisma.product.findFirst({
      where: {
        name: {
          contains: productName,
        },
      },
    });

    if (!product) {
      console.error(`❌ Fant ikke produktet: "${productName}"`);
      return;
    }

    console.log(`✅ Fant produktet: ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Supplier URL: ${product.supplierUrl || 'Ikke satt'}`);

    if (!product.supplierUrl) {
      console.error(`❌ Produktet har ingen supplierUrl. Kan ikke hente data.`);
      return;
    }

    // Hent data fra Temu
    console.log(`\n🌐 Henter data fra Temu...`);
    const scraper = new TemuScraper();
    const result = await scraper.scrapeProduct(product.supplierUrl);

    if (!result.success || !result.data) {
      console.error(`❌ Klarte ikke å hente data fra Temu:`, result.error);
      console.log(`   Prøver å fortsette med eksisterende data...`);
      return;
    }

    const data = result.data;
    console.log(`✅ Hentet data fra Temu!`);
    console.log(`   Tittel: ${data.title}`);
    console.log(`   Bilder: ${data.images?.length || 0}`);
    if (data.images && data.images.length > 0) {
      console.log(`   Første bilde: ${data.images[0].substring(0, 80)}...`);
    }
    console.log(`   Varianter: ${data.variants?.length || 0}`);
    if (data.variants && data.variants.length > 0) {
      console.log(`   Variant 1: ${data.variants[0].name} - $${data.variants[0].price}`);
    }
    console.log(`   Pris: ${data.price.amount} ${data.price.currency}`);

    // Oppdater bilder
    let updatedImages = product.images ? JSON.parse(product.images) : [];
    if (data.images && data.images.length > 0) {
      updatedImages = data.images;
      console.log(`\n📸 Oppdaterer bilder (${updatedImages.length} bilder)...`);
    }

    // Oppdater beskrivelse hvis den mangler eller er kort
    let updatedDescription = product.description || '';
    if (data.description && (!product.description || product.description.length < data.description.length)) {
      updatedDescription = data.description;
      console.log(`\n📝 Oppdaterer beskrivelse...`);
    }

    // Oppdater varianter
    let variantsToCreate: VariantCreateInput[] = [];
    if (data.variants && data.variants.length > 0) {
      // Slett eksisterende varianter
      await prisma.productVariant.deleteMany({
        where: { productId: product.id },
      });
      console.log(`\n🗑️  Slettet eksisterende varianter`);

      // Opprett nye varianter
      variantsToCreate = data.variants.map((variant, index) => ({
        name: variant.name || `Variant ${index + 1}`,
        price: variant.price || Number(product.price),
        compareAtPrice: variant.compareAtPrice || product.compareAtPrice,
        image: variant.image || updatedImages[0] || null,
        attributes: variant.attributes || {},
        stock: variant.stock || product.stock || 10,
        isActive: true,
        productId: product.id,
      }));
      console.log(`\n✨ Oppretter ${variantsToCreate.length} nye varianter...`);
    }

    // Oppdater produktet
    await prisma.product.update({
      where: { id: product.id },
      data: {
        images: JSON.stringify(updatedImages),
        description: updatedDescription,
        name: data.title || product.name,
        // Oppdater pris hvis den er signifikant annerledes
        ...(data.price.amount > 0 && Math.abs(data.price.amount - Number(product.price)) > 5
          ? { price: data.price.amount }
          : {}),
      },
    });

    // Opprett varianter hvis det finnes noen
    if (variantsToCreate.length > 0) {
      await prisma.productVariant.createMany({
        data: variantsToCreate,
      });
    }

    console.log(`\n✅ Produktet er oppdatert!`);
    console.log(`   Bilder: ${updatedImages.length}`);
    console.log(`   Varianter: ${variantsToCreate.length}`);
    console.log(`   Beskrivelse: ${updatedDescription.length} tegn`);

  } catch (error) {
    console.error(`❌ Feil ved oppdatering:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

// Kjør scriptet
const productName = process.argv[2] || 'ultra thin usb powered ergonomisk tastatur';

updateProduct(productName)
  .then(() => {
    console.log('\n✅ Ferdig!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Feil:', error);
    process.exit(1);
  });

