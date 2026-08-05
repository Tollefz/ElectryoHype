import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{ supplierName: string; supplierProductId: string; c: number }>
  >`
    SELECT "supplierName"::text as "supplierName",
           "supplierProductId",
           COUNT(*)::int as c
    FROM "Product"
    WHERE "supplierName" IS NOT NULL AND "supplierProductId" IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  `;
  console.log("DUPLICATES:", JSON.stringify(rows));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
