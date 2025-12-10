import { PrismaClient, SupplierName } from "@prisma/client";

const prisma = new PrismaClient();

type SeedProduct = {
  name: string;
  category: string;
  price: number;
  compareAtPrice: number;
  shortDescription: string;
  description: string;
};

const products: SeedProduct[] = [
  {
    name: "Premium Hodetelefoner",
    category: "Elektronikk",
    price: 599,
    compareAtPrice: 749,
    shortDescription: "Støydempende hodetelefoner med krystallklar lyd.",
    description:
      "<p>Opplev musikk på en helt ny måte med våre premium hodetelefoner. Aktiv støydemping lar deg fordype deg i favorittlåtene, mens den ergonomiske utformingen gjør dem komfortable hele dagen.</p><p>Bluetooth 5.2 sikrer stabil tilkobling, og 30 timers batteritid holder deg gående hele uken.</p>",
  },
  {
    name: "Smartklokke Pro",
    category: "Elektronikk",
    price: 899,
    compareAtPrice: 1099,
    shortDescription: "Multisport smartklokke med GPS og pulsmåling.",
    description:
      "<p>Hold oversikt over trening, helse og søvn med Smartklokke Pro. Innebygd GPS, pulsmåler og vanntetthet gjør den til en perfekt treningspartner.</p><p>Synkroniser varsler direkte fra telefonen og velg mellom flere stilfulle urskiver.</p>",
  },
  {
    name: "Trådløs Mus",
    category: "Elektronikk",
    price: 249,
    compareAtPrice: 329,
    shortDescription: "Ergonomisk mus med presis sensor og stilrent design.",
    description:
      "<p>Den trådløse musen gir deg presisjon og komfort til både jobb og spill. Fem tilpassbare knapper og justerbar DPI lar deg jobbe effektivt.</p><p>Med 45 dagers batteritid trenger du sjelden å lade.</p>",
  },
  {
    name: "Treningsmatte Deluxe",
    category: "Sport",
    price: 299,
    compareAtPrice: 379,
    shortDescription: "Skli-sikker matte med optimal tykkelse for yoga og trening.",
    description:
      "<p>Tren hjemme eller på studio med en matte som gir støtte og stabilitet. Den sklisikre overflaten og 6 mm tykkelse beskytter leddene dine.</p><p>Lett å rulle sammen og leveres med bærestropper.</p>",
  },
  {
    name: "Yogaboller Sett",
    category: "Sport",
    price: 199,
    compareAtPrice: 259,
    shortDescription: "Sett med to yogaboller for massasje og restitusjon.",
    description:
      "<p>Perfekt til å løsne muskelknuter etter trening. Bruk dem til yoga, pilates eller generell rehabilitering.</p><p>Produsert i slitesterkt naturgummi.</p>",
  },
  {
    name: "Duftlys Sett",
    category: "Hjem",
    price: 349,
    compareAtPrice: 449,
    shortDescription: "Tre eksklusive soyalys med naturdufter.",
    description:
      "<p>Skap ro i hjemmet med vår duftlys-kolleksjon. Inneholder lukter av lavendel, eukalyptus og sandeltre.</p><p>Hvert lys brenner i opptil 40 timer og kommer i gjenbrukbare glass.</p>",
  },
  {
    name: "Minimalistisk Bordlampe",
    category: "Hjem",
    price: 399,
    compareAtPrice: 529,
    shortDescription: "LED-lampe med justerbar lysstyrke og varm glød.",
    description:
      "<p>Designet for moderne hjem. Lampen gir et behagelig lys og kan dimmes etter behov.</p><p>USB-C-lading gjør den praktisk på skrivebordet eller nattbordet.</p>",
  },
  {
    name: "T-skjorte Premium",
    category: "Klær",
    price: 199,
    compareAtPrice: 249,
    shortDescription: "Myk bomullst-skjorte med perfekt passform.",
    description:
      "<p>En garderobeklassiker. Laget av 100% økologisk bomull og tilgjengelig i flere farger.</p><p>Designet for å holde fasongen vask etter vask.</p>",
  },
  {
    name: "Hettegenser Komfort",
    category: "Klær",
    price: 499,
    compareAtPrice: 649,
    shortDescription: "Varm hettegenser med børstet innside og stor lomme.",
    description:
      "<p>Perfekt for kalde kvelder eller avslappede helger. Hettegenseren har justerbar hette, ribbestrikkede detaljer og en praktisk kengurulomme.</p>",
  },
  {
    name: "Sportsundertøy Sett",
    category: "Klær",
    price: 299,
    compareAtPrice: 389,
    shortDescription: "Pustende sett med topp og tights.",
    description:
      "<p>Hold deg tørr og komfortabel under trening. Stoffet transporterer bort fuktighet og føles mykt mot huden.</p>",
  },
  {
    name: "Kokekarsett 5 deler",
    category: "Hjem",
    price: 799,
    compareAtPrice: 999,
    shortDescription: "Slitesterkt kokekarsett i rustfritt stål.",
    description:
      "<p>Settet består av to kjeler, en kasserolle og to lokk. Passer til alle platetopper, inkludert induksjon.</p><p>Perfekt for både nybegynnere og erfarne kokker.</p>",
  },
  {
    name: "Treningsball Pro",
    category: "Sport",
    price: 259,
    compareAtPrice: 329,
    shortDescription: "Stabil treningsball for styrke og balanseøvelser.",
    description:
      "<p>Inkluderer pumpe og treningsguide. Laget i anti-burst materiale som tåler opptil 250 kg.</p>",
  },
];

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function imageUrl(name: string) {
  const text = encodeURIComponent(name.toUpperCase());
  return `https://placehold.co/600x600/e2e8f0/64748b?text=${text}`;
}

function supplierId() {
  return `ALI${Math.floor(10000 + Math.random() * 90000)}`;
}

async function main() {
  const defaultStoreId = "default-store";
  await prisma.product.deleteMany();

  for (const product of products) {
    const supplierPrice = Number((product.price * 0.65).toFixed(2));
    await prisma.product.create({
      data: {
        name: product.name,
        slug: toSlug(product.name),
        shortDescription: product.shortDescription,
        description: product.description,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        supplierPrice,
        images: JSON.stringify([imageUrl(product.name)]),
        tags: JSON.stringify([product.category.toLowerCase(), "nyhet"]),
        category: product.category,
        isActive: true,
        storeId: defaultStoreId,
        supplierUrl: "https://alibaba.com/product/example",
        supplierName: SupplierName.alibaba,
        supplierProductId: supplierId(),
        stock: 100,
        profitMargin: "35%",
      },
    });
  }

  console.log("✅ Seed completed with demo products");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

