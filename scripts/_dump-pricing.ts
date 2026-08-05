import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const id = process.argv[2] || "cms6mn4bp00j0vff49xp91x4v";
  const c = await p.buyerCandidate.findUnique({
    where: { id },
    select: { pricing: true, supplierPrice: true, supplierCurrency: true },
  });
  console.log(JSON.stringify(c, null, 2));
}

main()
  .then(async () => {
    await p.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await p.$disconnect();
    process.exit(1);
  });
