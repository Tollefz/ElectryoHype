/**
 * Verify Mission Control: pause / resume / stop + live candidates snapshot.
 * Run: npx tsx scripts/_verify-mission-control.ts
 */
import {
  getLatestBuyerScan,
  getLiveMissionSnapshot,
  pauseBuyerMission,
  resumeBuyerMission,
  stopBuyerMission,
  processBuyerScanBatch,
} from "../lib/buyer/scan";

async function main() {
  const before = await getLatestBuyerScan();
  if (!before) {
    console.error("NO_SCAN");
    process.exit(1);
  }
  console.log("BEFORE", {
    id: before.id.slice(-8),
    status: before.status,
    scanned: before.scanned,
    kept: before.kept,
    checkpoint: before.checkpoint,
  });

  const snap = await getLiveMissionSnapshot({ scanRunId: before.id });
  console.log("LIVE_SNAP", {
    candidates: snap.candidates.length,
    topFinds: snap.topFinds.length,
    metrics: snap.metrics,
  });

  if (before.status === "running" || before.status === "queued") {
    const paused = await pauseBuyerMission({ scanRunId: before.id });
    console.log("PAUSE", {
      status: paused.status,
      cancelledJobs: paused.cancelledJobs,
      checkpoint: paused.checkpoint,
    });

    // Verify batch does nothing while paused
    const batch = await processBuyerScanBatch(before.id);
    console.log("BATCH_WHILE_PAUSED", batch);

    const afterPause = await getLatestBuyerScan();
    console.log("AFTER_PAUSE", {
      status: afterPause?.status,
      scanned: afterPause?.scanned,
      sameScanned: afterPause?.scanned === before.scanned,
    });

    const resumed = await resumeBuyerMission({ scanRunId: before.id });
    console.log("RESUME", {
      status: resumed.status,
      checkpoint: resumed.checkpoint,
    });

    const afterResume = await getLatestBuyerScan();
    console.log("AFTER_RESUME", {
      status: afterResume?.status,
      scanned: afterResume?.scanned,
    });
  } else if (before.status === "paused") {
    const resumed = await resumeBuyerMission({ scanRunId: before.id });
    console.log("RESUME_FROM_PAUSED", resumed.status);
  } else {
    console.log("SKIP_PAUSE_RESUME — status", before.status);
  }

  // Don't actually stop a live production mission in verify unless STOP=1
  if (process.env.STOP === "1") {
    const stopped = await stopBuyerMission({
      scanRunId: before.id,
      reason: "Verify stop",
    });
    console.log("STOP", stopped);
  } else {
    console.log("STOP_SKIPPED (set STOP=1 to exercise)");
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
