import { PrismaClient } from "@prisma/client";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import {
  buildMetaTitle,
  buildMetaDescription,
  norwegianShortDescription,
} from "@/lib/merchandiser/full-catalog-pass";
import slugify from "slugify";

const prisma = new PrismaClient();

function forceTitle(name: string): string | "UNPUBLISH" | null {
  const n = name.toLowerCase();
  if (/spin\s*scrubber|telescopic/.test(n)) return "UNPUBLISH";
  if (/mobile\s*power|power\s*supply|charge\s*bank|pd\s*rask\s*charge/.test(n)) {
    if (/20000|20\s*000/.test(n)) return "Powerbank 20000 mAh";
    if (/20w|pd/.test(n)) return "Powerbank 20W PD";
    if (/outdoor|stall|emergency/.test(n)) return "Robust utendørs powerbank";
    return "Powerbank med toveis lading";
  }
  if (/lavalier|condenser|neewer|k\s*song|sampling\s*rate/.test(n)) {
    return "USB kondensatormikrofon";
  }
  if (/wired\s*controller/.test(n)) return "USB spillkontroller";
  if (/thumb\s*wheel|ergonomic\s*three-mode|m618/.test(n)) {
    return "Ergonomisk Bluetooth-mus";
  }
  if (/neck\s*feste|phone\s*magnetisk|quick\s*release\s*hold/.test(n)) {
    return "Magnetisk telefonholder";
  }
  if (/monitor\s*stands|dj\s*studio/.test(n)) return "Stativ til studiomonitor (2-pk)";
  if (/eight-core\s*nettbrett|android\s*13/.test(n)) return "Android-nettbrett 8 tommer";
  if (/tastatur\s*stativ|x\s*shape/.test(n)) return "Justerbart tastaturstativ";
  if (/tripod\s*mic\s*stativ|floor\s*justerbar/.test(n)) return "Mikrofonstativ med tripod";
  if (/nettbrett\s*deksel/.test(n)) return "Nettbrett-deksel med tastatur";
  return null;
}

async function main() {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  let unpublished = 0;
  let fixed = 0;

  for (const p of products) {
    const forced = forceTitle(p.name);
    if (forced === "UNPUBLISH") {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, buyerLifecycle: "discontinued" },
      });
      unpublished += 1;
      continue;
    }
    if (!forced && !looksLikeEnglishTitle(p.name)) continue;
    const title = forced || p.name;
    if (title === p.name && !looksLikeEnglishTitle(p.name)) continue;
    if (!forced) continue;

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
    select: { name: true, category: true, price: true, compareAtPrice: true },
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
        sampleEnglish: eng.slice(0, 20).map((e) => e.name),
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
