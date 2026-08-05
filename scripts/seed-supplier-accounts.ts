/**
 * Seed default SupplierAccounts + SyncPolicies; backfill product.supplierAccountId.
 */
import { prisma } from "../lib/prisma";
import { ensureDefaultSupplierAccount } from "../lib/suppliers/accounts";

async function main() {
  const cj = await ensureDefaultSupplierAccount("cj");
  const csv = await ensureDefaultSupplierAccount("csv");
  console.log("accounts", { cj: cj.id, csv: csv.id });

  const cjUpdated = await prisma.product.updateMany({
    where: { supplierName: "cj", supplierAccountId: null },
    data: { supplierAccountId: cj.id },
  });
  const csvUpdated = await prisma.product.updateMany({
    where: { supplierName: "csv", supplierAccountId: null },
    data: { supplierAccountId: csv.id },
  });
  const queueCj = await prisma.importQueueItem.updateMany({
    where: { supplier: "cj", supplierAccountId: null },
    data: { supplierAccountId: cj.id },
  });
  const queueCsv = await prisma.importQueueItem.updateMany({
    where: { supplier: "csv", supplierAccountId: null },
    data: { supplierAccountId: csv.id },
  });

  console.log("backfill", {
    products: { cj: cjUpdated.count, csv: csvUpdated.count },
    queue: { cj: queueCj.count, csv: queueCsv.count },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
