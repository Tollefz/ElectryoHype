import { getDigitalBuyerDeskStatus } from "../lib/buyer/desk-status";

async function main() {
  const s = await getDigitalBuyerDeskStatus();
  console.log(
    JSON.stringify(
      {
        trafficLight: s.trafficLight,
        phase: s.phase,
        nextStep: s.nextStep,
        phaseSteps: s.phaseSteps,
        publishJob: s.publishJob
          ? {
              id: s.publishJob.id,
              status: s.publishJob.status,
              processed: s.publishJob.processed,
              total: s.publishJob.totalProducts,
              published: s.publishJob.published,
              skipped: s.publishJob.skipped,
              failed: s.publishJob.failed,
              ppm: s.publishJob.productsPerMin,
              etaSeconds: s.publishJob.etaSeconds,
              currentBatch: s.publishJob.currentBatch,
              totalBatches: s.publishJob.totalBatches,
            }
          : null,
        workerStatus: s.workerStatus,
        workerHeartbeat: s.workerHeartbeat,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
