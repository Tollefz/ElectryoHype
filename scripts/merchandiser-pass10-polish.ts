import { PrismaClient } from "@prisma/client";
import slugify from "slugify";
import {
  buildMetaDescription,
  buildMetaTitle,
  norwegianRetailTitle,
  norwegianShortDescription,
} from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

const FORCE: Array<{ re: RegExp; title: string; drop?: boolean }> = [
  { re: /computer\s*deksel\s*fan|neon\s*light\s*bar|fan\s*light\s*emitting/i, title: "PC-vifte med LED", drop: true },
  { re: /live\s*ring\s*led|fill\s*light/i, title: "LED ringlys til mobil", drop: true },
  { re: /suitable\s*til\s*light\s*black|protective\s*belt/i, title: "Uforståelig produkt", drop: true },
  { re: /colorful\s*rgb\s*light\s*effect.*earphone|f9\s*bluetooth\s*earphone/i, title: "Bluetooth-ørepropper med RGB" },
  { re: /gamepad\s*rgb.*lader|fixed\s*lader\s*led\s*indicator/i, title: "RGB-ladestasjon til gamepad" },
  { re: /61-key|membrane\s*tastatur|mixed\s*light\s*wired/i, title: "Gaming-tastatur" },
];

async function uniqueSlug(base: string, excludeId: string) {
  let slug = slugify(base, { lower: true, strict: true, locale: "nb" }).slice(0, 70);
  let i = 0;
  while (
    await prisma.product.findFirst({
      where: { slug, id: { not: excludeId } },
      select: { id: true },
    })
  ) {
    i += 1;
    slug =
      slugify(base, { lower: true, strict: true, locale: "nb" }).slice(0, 65) +
      "-" +
      i;
  }
  return slug;
}

function looksSupplierJunk(name: string): boolean {
  const en = (
    name.match(
      /\b(with|and|for|suitable|compatible|portable|adjustable|universal|emitting|indicator|effect|light|black|abs|plastic|protective|belt|fan|neon|ring|live|fill|colorful|fixed)\b/gi
    ) || []
  ).length;
  return en >= 3 || /suitable\s*til|deksel\s*fan|fill\s*light|protective\s*belt/i.test(name);
}

async function main() {
  const active = await prisma.product.findMany({ where: { isActive: true } });
  let fixed = 0;
  let dropped = 0;

  for (const p of active) {
    let matched = false;
    for (const f of FORCE) {
      if (f.re.test(p.name)) {
        matched = true;
        if (f.drop) {
          await prisma.product.update({
            where: { id: p.id },
            data: {
              name: f.title,
              isActive: false,
              buyerLifecycle: "discontinued",
            },
          });
          dropped += 1;
        } else if (p.name !== f.title) {
          const short = norwegianShortDescription(p, f.title);
          await prisma.product.update({
            where: { id: p.id },
            data: {
              name: f.title,
              slug: await uniqueSlug(f.title, p.id),
              metaTitle: buildMetaTitle(f.title),
              metaDescription: buildMetaDescription(f.title, short),
              shortDescription: short,
            },
          });
          fixed += 1;
        }
        break;
      }
    }
    if (matched) continue;

    if (looksSupplierJunk(p.name)) {
      const title = norwegianRetailTitle(p.name);
      if (title && title !== p.name && !looksSupplierJunk(title)) {
        const short = norwegianShortDescription(p, title);
        await prisma.product.update({
          where: { id: p.id },
          data: {
            name: title,
            slug: await uniqueSlug(title, p.id),
            metaTitle: buildMetaTitle(title),
            metaDescription: buildMetaDescription(title, short),
            shortDescription: short,
          },
        });
        fixed += 1;
      } else {
        await prisma.product.update({
          where: { id: p.id },
          data: { isActive: false, buyerLifecycle: "discontinued" },
        });
        dropped += 1;
        console.log("drop junk", p.name.slice(0, 80));
      }
    }
  }

  const activeN = await prisma.product.count({ where: { isActive: true } });
  const inactiveN = await prisma.product.count({ where: { isActive: false } });
  const sample = await prisma.product.findMany({
    where: { isActive: true },
    select: { name: true },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });
  console.log(
    JSON.stringify(
      {
        fixed,
        dropped,
        activeN,
        inactiveN,
        recentNames: sample.map((s) => s.name),
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
