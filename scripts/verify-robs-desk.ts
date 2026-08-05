import "dotenv/config";

async function main() {
  const { getDeskQueues, getTodayPnl } = await import("../lib/ops/robs-desk.ts");
  const storeId = "default-store";
  const queues = await getDeskQueues(storeId);
  const pnl = await getTodayPnl(storeId);
  console.log("queues", queues);
  console.log("pnl.paidOrders", pnl.paidOrders);
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
