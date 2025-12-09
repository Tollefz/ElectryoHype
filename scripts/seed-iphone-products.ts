import "dotenv/config";
import slugify from "slugify";
import { prisma } from "../lib/prisma";

const iphoneProducts = [
  {
    name: "iPhone 16 USB-C Lader - Original Lignende",
    shortDescription: "Rask lading med USB-C til Lightning kabel inkludert. Kompatibel med iPhone 16, 15, 14, 13 og eldre modeller.",
    description: `
      <h3>Høyhastighetslading for iPhone</h3>
      <p>Denne USB-C laderen gir rask og sikker lading til din iPhone 16 og andre Lightning-kompatible enheter. Med 20W effekt kan du lade telefonen fra 0 til 50% på bare 30 minutter.</p>
      <ul>
        <li>20W USB-C Power Adapter</li>
        <li>Inkluderer 1m USB-C til Lightning kabel</li>
        <li>CE og FCC sertifisert</li>
        <li>Overlading og overopphetningsbeskyttelse</li>
        <li>Kompatibel med alle iPhone-modeller med Lightning-port</li>
      </ul>
    `,
    price: 299,
    compareAtPrice: 499,
    supplierPrice: 45, // USD fra Alibaba
    category: "Elektronikk",
    tags: ["iPhone 16", "lader", "USB-C", "original lignende", "rask lading"],
    images: [
      "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Effekt: "20W",
      Type: "USB-C Power Adapter",
      Kabel: "USB-C til Lightning (1m)",
      Kompatibilitet: "iPhone 16, 15, 14, 13, 12, 11, X, 8",
      Sertifisering: "CE, FCC",
    },
    supplierUrl: null, // Sett til ekte Alibaba URL når produktet importeres
    supplierProductId: "IPH16-CHARGER-001",
  },
  {
    name: "iPhone 16 Deksel - Klar Hard Case Transparent",
    shortDescription: "Klar hard case i premium materiale som beskytter telefonen uten å skjule designet. Passer perfekt for iPhone 16.",
    description: `
      <h3>Premium Hard Case for iPhone 16</h3>
      <p>Beskytt din iPhone 16 med denne elegante klare hard case. Designet for å beskytte mot støt og riper, samtidig som den bevarer telefonen slanke profil og viser frem det vakre designet.</p>
      <ul>
        <li>100% klar PC materiale</li>
        <li>Støtsikker konstruksjon</li>
        <li>Forbedret grep</li>
        <li>Presis passform for alle porter og knapper</li>
        <li>Rikantbeskyttelse for kamera</li>
      </ul>
    `,
    price: 199,
    compareAtPrice: 349,
    supplierPrice: 12,
    category: "Tilbehør",
    tags: ["iPhone 16", "deksel", "hard case", "klar", "transparent", "beskyttelse"],
    images: [
      "https://images.unsplash.com/photo-1616348436168-b43b2d01d1aa?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1616348436168-b43b2d01d1aa?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Materiale: "Polycarbonat (PC)",
      Type: "Hard Case",
      Farge: "Klar/Transparent",
      Beskyttelse: "4-corner drop protection",
      Vekt: "25g",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-CASE-CLEAR-001",
  },
  {
    name: "iPhone 16 Deksel - Premium Silikon Case",
    shortDescription: "Myk silikon deksel som gir utmerket grep og beskyttelse. Tilgjengelig i flere farger. Passer iPhone 16 perfekt.",
    description: `
      <h3>Premium Silikon Deksel for iPhone 16</h3>
      <p>Opplev premium kvalitet med denne silikon dekselen. Myk og behagelig i hånden, samtidig som den gir solid beskyttelse mot støt og riper.</p>
      <ul>
        <li>Premium liquid silikon materiale</li>
        <li>Støtabsorberende design</li>
        <li>Fingeravtrykkavvisende overflate</li>
        <li>Forbedret laderport-åpning</li>
        <li>Tilgjengelig i 8 ulike farger</li>
      </ul>
    `,
    price: 249,
    compareAtPrice: 399,
    supplierPrice: 15,
    category: "Tilbehør",
    tags: ["iPhone 16", "deksel", "silikon", "premium", "myk", "grip"],
    images: [
      "https://images.unsplash.com/photo-1601972602237-8c79241e468b?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1601972602237-8c79241e468b?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Materiale: "Premium Liquid Silikon",
      Type: "Soft Case",
      Farger: "8 farger tilgjengelig",
      Beskyttelse: "Støtabsorberende",
      Vekt: "30g",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-CASE-SILICONE-001",
  },
  {
    name: "iPhone 16 Deksel - Lærfoderal Elegant",
    shortDescription: "Elegant lærfoderal med magnetisk lukking. Premium kvalitet som gir både beskyttelse og stil for din iPhone 16.",
    description: `
      <h3>Elegant Lærfoderal for iPhone 16</h3>
      <p>Gi din iPhone 16 en elegant beskyttelse med dette premium lærfoderalet. Perfekt for dem som verdsetter både funksjonalitet og stil.</p>
      <ul>
        <li>Ekte lær eller premium syntetisk lær</li>
        <li>Magnetisk lukking</li>
        <li>Kreditkort-lomme på baksiden</li>
        <li>Skjermbeskyttelse når lukket</li>
        <li>Tilgjengelig i svart, brun og nøttefarge</li>
      </ul>
    `,
    price: 399,
    compareAtPrice: 599,
    supplierPrice: 25,
    category: "Tilbehør",
    tags: ["iPhone 16", "foderal", "lær", "elegant", "premium", "magnetisk"],
    images: [
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1616348436168-b43b2d01d1aa?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Materiale: "Premium Lær",
      Type: "Flip Case / Foderal",
      Lukking: "Magnetisk",
      Ekstra: "Kreditkort-lomme",
      Farger: "Svart, Brun, Nøtte",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-CASE-LEATHER-001",
  },
  {
    name: "iPhone 16 Skjermbeskytter - Premium Glass 9H",
    shortDescription: "Tempert glass skjermbeskytter med 9H hardhet. Full dekning med oljefri coating og høy klarhet for iPhone 16.",
    description: `
      <h3>Premium Skjermbeskytter 9H for iPhone 16</h3>
      <p>Beskyt skjermen på din iPhone 16 med dette premium temperte glasset. Med 9H hardhet og full dekning gir det maksimal beskyttelse mot riper og knus.</p>
      <ul>
        <li>9H hardhet (nær diamanthard)</li>
        <li>Full dekning for front og notch</li>
        <li>Oljefri coating mot fingeravtrykk</li>
        <li>99% lysgjennomgang for høy klarhet</li>
        <li>Inkluderer monteringsverktøy</li>
      </ul>
    `,
    price: 179,
    compareAtPrice: 299,
    supplierPrice: 8,
    category: "Tilbehør",
    tags: ["iPhone 16", "skjermbeskytter", "glass", "9H", "temperert", "beskyttelse"],
    images: [
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Materiale: "Tempert Glass",
      Hardhet: "9H",
      Tykkelse: "0.33mm",
      Lysgjennomgang: "99%",
      Coating: "Oljefri",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-SCREEN-001",
  },
  {
    name: "iPhone 16 MagSafe Lader - 15W Trådløs",
    shortDescription: "MagSafe-kompatibel trådløs lader med 15W hurtiglading. Magnetisk festing som fungerer perfekt med iPhone 16.",
    description: `
      <h3>MagSafe Trådløs Lader for iPhone 16</h3>
      <p>Opplev rask og enkel trådløs lading med denne MagSafe-kompatible laderen. Med 15W effekt og magnetisk festing får du enkel og sikker lading uten kabler.</p>
      <ul>
        <li>15W trådløs hurtiglading</li>
        <li>Magnetisk MagSafe-festing</li>
        <li>USB-C tilkobling</li>
        <li>LED-indikator for lading</li>
        <li>Overoppheting og overladingsbeskyttelse</li>
      </ul>
    `,
    price: 349,
    compareAtPrice: 549,
    supplierPrice: 35,
    category: "Elektronikk",
    tags: ["iPhone 16", "magsafe", "trådløs lader", "15W", "magnetisk", "hurtiglading"],
    images: [
      "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Effekt: "15W (Trådløs)",
      Type: "MagSafe-kompatibel",
      Tilkobling: "USB-C",
      Ledning: "USB-C kabel inkludert",
      Magnetisk: "Ja",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-MAGSAFE-001",
  },
  {
    name: "iPhone 16 Kameralinse Beskytter - Premium Glass",
    shortDescription: "Beskyt kameralinsene på iPhone 16 med denne transparente glass-beskyttelsen. Presis passform og 9H hardhet.",
    description: `
      <h3>Kamera Beskytter for iPhone 16</h3>
      <p>Gi din iPhone 16's kameramodul maksimal beskyttelse med denne transparente glass-beskyttelsen. Forhindrer riper og beskytter mot daglig slitasje.</p>
      <ul>
        <li>9H hardhetstestet glass</li>
        <li>Presis passform for kameramodul</li>
        <li>100% transparent uten påvirkning på foto kvalitet</li>
        <li>Oljefri coating</li>
        <li>Enkel montering</li>
      </ul>
    `,
    price: 149,
    compareAtPrice: 249,
    supplierPrice: 6,
    category: "Tilbehør",
    tags: ["iPhone 16", "kamera beskytter", "glass", "linseskydd", "9H"],
    images: [
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Materiale: "Tempert Glass",
      Hardhet: "9H",
      Dekning: "Kamera-linse",
      Kvalitet: "100% transparent",
      Montering: "Selvklebende",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-CAMERA-001",
  },
  {
    name: "iPhone 16 Bilholder - Magnetisk Air Vent Mount",
    shortDescription: "Magnetisk bilholder som festes til luftutblåsning. Sterk magnetisk festing for iPhone 16 med MagSafe eller magnetisk deksel.",
    description: `
      <h3>Magnetisk Bilholder for iPhone 16</h3>
      <p>Hold telefonen trygt og synlig i bilen med denne magnetiske holderen. Festes til luftutblåsning og gir rask tilgang til navigasjon, musikk og telefonfunksjoner.</p>
      <ul>
        <li>Sterk magnetisk festing</li>
        <li>Fester til luftutblåsning</li>
        <li>360° rotasjon for perfekt vinkel</li>
        <li>Kompatibel med MagSafe</li>
        <li>Støtabsorberende design</li>
      </ul>
    `,
    price: 249,
    compareAtPrice: 399,
    supplierPrice: 18,
    category: "Tilbehør",
    tags: ["iPhone 16", "bilholder", "magnetisk", "air vent", "car mount"],
    images: [
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1601972602237-8c79241e468b?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Type: "Magnetisk Air Vent Mount",
      Rotasjon: "360°",
      Magnetisk: "Sterk neodymium magnet",
      Kompatibilitet: "iPhone 16 + MagSafe",
      Vekt: "85g",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-CARMOUNT-001",
  },
  {
    name: "iPhone 16 Ladekabel - USB-C til Lightning 2m",
    shortDescription: "Premium ladekabel i 2 meter lengde. Rask dataoverføring og lading. Tverrfesting og fleksibel for lang levetid.",
    description: `
      <h3>Premium USB-C til Lightning Kabel 2m</h3>
      <p>Opplev rask lading og dataoverføring med denne premium kabelen. Med 2 meter lengde gir den deg fleksibilitet både hjemme, på jobb og i bilen.</p>
      <ul>
        <li>2 meter lengde</li>
        <li>Rask lading og dataoverføring</li>
        <li>Tverrfesting ved endene</li>
        <li>Fleksibel og robust design</li>
        <li>MFi-sertifisert (Made for iPhone)</li>
      </ul>
    `,
    price: 219,
    compareAtPrice: 349,
    supplierPrice: 10,
    category: "Elektronikk",
    tags: ["iPhone 16", "ladekabel", "USB-C", "Lightning", "2 meter", "MFi"],
    images: [
      "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Type: "USB-C til Lightning",
      Lengde: "2 meter",
      Sertifisering: "MFi-sertifisert",
      Lading: "Rask lading støttet",
      Data: "USB 2.0 hastighet",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-CABLE-001",
  },
  {
    name: "AirPods Pro Deksel - Hard Case Beskyttelse",
    shortDescription: "Premium hard case for AirPods Pro og Pro 2. Beskytt og personaliser dine AirPods med dette elegante dekselet. Tilgjengelig i flere farger.",
    description: `
      <h3>Premium Hard Case for AirPods Pro</h3>
      <p>Gi dine AirPods Pro maksimal beskyttelse og stil med dette premium hard case dekselet. Presis passform som beskytter mot støt, riper og slitasje.</p>
      <ul>
        <li>Premium PC materiale</li>
        <li>Presis passform for AirPods Pro/Pro 2</li>
        <li>Beskyttelse for alle porter og knapper</li>
        <li>Karabinkroko for festing til nøkler eller bag</li>
        <li>Tilgjengelig i 12 ulike farger</li>
      </ul>
    `,
    price: 179,
    compareAtPrice: 299,
    supplierPrice: 11,
    category: "Tilbehør",
    tags: ["AirPods Pro", "deksel", "hard case", "beskyttelse", "iPhone tilbehør"],
    images: [
      "https://images.unsplash.com/photo-1600294037681-80e5c247c3e4?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&h=800&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1600294037681-80e5c247c3e4?w=800&h=800&fit=crop&auto=format",
    ],
    specs: {
      Materiale: "Polycarbonat (PC)",
      Kompatibilitet: "AirPods Pro & Pro 2",
      Type: "Hard Case",
      Ekstra: "Karabinkroko",
      Farger: "12 farger",
    },
    supplierUrl: null,
    supplierProductId: "IPH16-AIRPODS-001",
  },
];

async function main() {
  console.log("🚀 Starter seeding av iPhone produkter...");

  for (let i = 0; i < iphoneProducts.length; i++) {
    const product = iphoneProducts[i];
    const slug = slugify(product.name, { lower: true, strict: true });
    // Generer unik SKU basert på supplierProductId eller index
    const skuSuffix = product.supplierProductId?.split("-").pop() || `PROD-${i + 1}`;
    const sku = `IPH16-${skuSuffix}`;
    const profitMargin = Math.round(((product.price / product.supplierPrice - 1) * 100)).toString() + "%";

    try {
      // Sjekk om produktet allerede eksisterer basert på slug
      const existing = await prisma.product.findUnique({
        where: { slug },
      });

      const productData = {
        name: product.name,
        shortDescription: product.shortDescription,
        description: product.description,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        supplierPrice: product.supplierPrice,
        images: JSON.stringify(product.images),
        supplierUrl: product.supplierUrl,
        supplierName: "alibaba" as const,
        supplierProductId: product.supplierProductId,
        profitMargin,
        category: product.category,
        tags: JSON.stringify(product.tags),
        stock: 100, // Standard lagerbeholdning
        isActive: true,
        specs: product.specs,
      };

      if (existing) {
        // Oppdater eksisterende produkt (unntatt SKU)
        await prisma.product.update({
          where: { slug },
          data: productData,
        });
        console.log(`✅ Oppdatert: ${product.name}`);
      } else {
        // Sjekk om SKU allerede eksisterer
        const existingSku = await prisma.product.findUnique({
          where: { sku },
        });

        // Hvis SKU eksisterer, generer en ny
        let finalSku = sku;
        if (existingSku) {
          finalSku = `IPH16-${skuSuffix}-${Date.now()}`;
        }

        // Opprett nytt produkt
        await prisma.product.create({
          data: {
            ...productData,
            slug,
            sku: finalSku,
          },
        });
        console.log(`✅ Lagt til: ${product.name}`);
      }
    } catch (error) {
      console.error(`❌ Feil ved lagring av ${product.name}:`, error);
    }
  }

  console.log("\n✅ Alle iPhone produkter er lagt til!");
  console.log(`📦 Totalt ${iphoneProducts.length} produkter importert fra Alibaba`);
}

main()
  .catch((error) => {
    console.error("❌ Feil under seeding:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

