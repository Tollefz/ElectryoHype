import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, tags: true },
  });

  const bad = active.filter((p) => {
    const n = p.name;
    if (/multifunctional|five-in-one|clip-on|infrared|sensing|magic|maiduo|subwoofer\s*sports|electronic\s*sports|t306\b/i.test(n))
      return true;
    const en = (
      n.match(
        /\b(with|and|for|small|pair|box|night|audio|suitable|compatible|portable|adjustable|universal|removable|rechargeable|emitting|indicator|multifunctional|infrared|sensing|magic|clip|sports|electronic)\b/gi
      ) || []
    ).length;
    return en >= 2 && /trådløs|lading|gaming/i.test(n);
  });

  console.log(JSON.stringify({ count: bad.length, names: bad.map((b) => b.name) }, null, 2));

  for (const j of bad) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(j.tags || "[]");
    } catch {
      tags = [];
    }
    if (!Array.isArray(tags)) tags = [];
    tags = tags.filter((t) => !/^merch:/i.test(String(t)));
    tags.push("merch:D");
    await prisma.product.update({
      where: { id: j.id },
      data: {
        isActive: false,
        buyerLifecycle: "declining",
        tags: JSON.stringify(tags),
        qualityScore: 40,
      },
    });
  }
}

main().finally(() => prisma.$disconnect());
