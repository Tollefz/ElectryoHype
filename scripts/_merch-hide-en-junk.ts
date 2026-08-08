import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, tags: true },
  });
  const junk = active.filter((p) => {
    const en = (
      p.name.match(
        /\b(with|and|for|small|pair|box|night|mushroom|audio|suitable|compatible|portable|adjustable|universal|removable|rechargeable|emitting|indicator|light)\b/gi
      ) || []
    ).length;
    return en >= 3 || /mushroom|pair\s*box|tws\s*pair/i.test(p.name);
  });
  console.log(JSON.stringify({ count: junk.length, names: junk.map((j) => j.name) }, null, 2));
  for (const j of junk) {
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
      },
    });
  }
}

main().finally(() => prisma.$disconnect());
