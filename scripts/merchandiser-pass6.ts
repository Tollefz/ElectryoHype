import { PrismaClient } from "@prisma/client";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import {
  buildMetaTitle,
  buildMetaDescription,
  norwegianShortDescription,
} from "@/lib/merchandiser/full-catalog-pass";
import slugify from "slugify";

const prisma = new PrismaClient();

function decide(name: string): { title?: string; unpublish?: string } {
  const n = name.toLowerCase();
  if (/computer\s*desk|glass\s*cabinets|tire\s*inflator|air\s*compressor|voice\s*changer|pocket.*smartphone|phone\s*radiator|hot\s*mobile\s*phone\s*radiator/.test(n)) {
    return { unpublish: "Utenfor premium elektronikk-sortiment" };
  }
  if (/liftable\s*qi|qi\s*ultra-thin|rask\s*charge/.test(n)) return { title: "Trådløs Qi-lader" };
  if (/double\s*head\s*usb|type-c.*macbook|multiple\s*ports\s*type-c/.test(n)) {
    return { title: "USB-C adapter / hub" };
  }
  if (/video\s*light|selfie\s*led\s*ring|fill\s*light\s*tripod/.test(n)) {
    return { title: "LED ringlys til mobil" };
  }
  if (/mini\s*bærbar\s*dual\s*band/.test(n)) return { title: "Bærbar WiFi-ruter" };
  if (/under\s*desk\s*kabel|cable\s*management\s*tray/.test(n)) {
    return { title: "Kabelholder under skrivebord" };
  }
  if (/ipad|nettbrett\s*stands|tablet\s*stand/.test(n)) return { title: "Nettbrettstativ" };
  if (/large\s*capacity\s*power|mobile\s*supply/.test(n)) return { title: "Powerbank med display" };
  return {};
}

async function main() {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  let unpublished = 0;
  let fixed = 0;

  for (const p of products) {
    if (!looksLikeEnglishTitle(p.name)) continue;
    const d = decide(p.name);
    if (d.unpublish) {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, buyerLifecycle: "discontinued" },
      });
      unpublished += 1;
      continue;
    }
    if (!d.title) continue;
    const title = d.title;
    const short = norwegianShortDescription(p as never, title);
    const desired = slugify(title, { lower: true, strict: true, locale: "nb" }).slice(0, 70);
    let slug = desired;
    let n = 0;
    while (
      await prisma.product.findFirst({
        where: { slug, id: { not: p.id } },
        select: { id: true },
      })
    ) {
      n += 1;
      slug = `${desired}-${n}`;
    }
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: title,
        slug,
        metaTitle: buildMetaTitle(title),
        metaDescription: buildMetaDescription(title, short),
        shortDescription: short,
      },
    });
    fixed += 1;
  }

  const active = await prisma.product.findMany({
    where: { isActive: true },
    select: { name: true, category: true },
  });
  const eng = active.filter((x) => looksLikeEnglishTitle(x.name));
  const byCat: Record<string, number> = {};
  for (const x of active) byCat[x.category || "?"] = (byCat[x.category || "?"] || 0) + 1;

  console.log(
    JSON.stringify(
      {
        unpublished,
        fixed,
        active: active.length,
        englishRemaining: eng.length,
        byCat,
        sampleEnglish: eng.map((e) => e.name),
        sampleStorefront: active.slice(0, 15).map((e) => e.name),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
