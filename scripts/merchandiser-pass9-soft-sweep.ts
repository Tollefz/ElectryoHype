import { PrismaClient } from "@prisma/client";
import { decideUnpublish } from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

const EXTRA: Array<{ re: RegExp; reason: string }> = [
  { re: /ragdoll\s*cat|cat\s*cute|keycap.*cat|tastatur.*caps.*cat/i, reason: "Kjæledyr / novelty" },
  { re: /wine\s*glass|rose\s*flower|holiday.*pen|note\s*board\s*led|message\s*holiday/i, reason: "Home decor / novelty" },
  { re: /bicycle\s*light|bike\s*light|sykkellykt/i, reason: "Sykkeltilbehør utenfor sortiment" },
  { re: /net\s*celebrity|fill\s*light.*celebrity|selfie\s*fill|ring\s*selfie/i, reason: "Beauty / influencer-gadget" },
  { re: /hand\s*warmer|håndvarmer/i, reason: "Lifestyle utenfor sortiment" },
  { re: /protective\s*belt\s*speed|suitable\s*til\s*light\s*black|abs\s*plastic\s*protective/i, reason: "AliExpress-tilfeldig" },
  { re: /dual\s*card\s*standby|2g\s*mobile\s*phone|flip\s*phone|unlocked\s*smartphone/i, reason: "Unlocket / dropship-telefon" },
  { re: /water\s*ripple|home\s*decor|neon\s*bar.*fan\s*light/i, reason: "Home decor / novelty" },
];

async function main() {
  const active = await prisma.product.findMany({ where: { isActive: true } });
  const toDrop: Array<{ id: string; name: string; reason: string }> = [];

  for (const p of active) {
    try {
      const d = decideUnpublish(p as never);
      if (d?.unpublish) {
        toDrop.push({ id: p.id, name: p.name, reason: d.reason });
        continue;
      }
    } catch {
      // ignore DNA parse errors; fall through to EXTRA
    }

    const hay = `${p.name} ${p.shortDescription || ""} ${p.description || ""} ${p.tags || ""}`;
    for (const e of EXTRA) {
      if (e.re.test(hay)) {
        toDrop.push({ id: p.id, name: p.name, reason: e.reason });
        break;
      }
    }
  }

  console.log("toUnpublish", toDrop.length);
  for (const row of toDrop.slice(0, 50)) {
    console.log("-", row.reason, "·", row.name);
  }

  for (const row of toDrop) {
    await prisma.product.update({
      where: { id: row.id },
      data: { isActive: false, buyerLifecycle: "discontinued" },
    });
  }

  const activeN = await prisma.product.count({ where: { isActive: true } });
  const inactiveN = await prisma.product.count({ where: { isActive: false } });
  console.log(JSON.stringify({ activeN, inactiveN, unpublishedThisPass: toDrop.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
