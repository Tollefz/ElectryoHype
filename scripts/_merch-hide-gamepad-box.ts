import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.product.findMany({
    where: { isActive: true, name: { contains: "Gamepad Box" } },
  });
  for (const p of rows) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(p.tags || "[]");
    } catch {
      tags = [];
    }
    tags = tags.filter((t) => !/^merch:/i.test(String(t)));
    tags.push("merch:D");
    await prisma.product.update({
      where: { id: p.id },
      data: {
        isActive: false,
        buyerLifecycle: "declining",
        tags: JSON.stringify(tags),
        qualityScore: 30,
      },
    });
    console.log("hid", p.name);
  }
  if (!rows.length) console.log("none");
}
main().finally(() => prisma.$disconnect());
