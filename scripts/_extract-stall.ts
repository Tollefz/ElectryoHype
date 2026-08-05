import fs from "fs";
const raw = fs.readFileSync("scripts/_stall-out.json", "utf8").replace(/^\uFEFF/, "");
const j = JSON.parse(raw);
fs.writeFileSync(
  "scripts/_stall-pick.json",
  JSON.stringify(
    {
      now: j.now,
      activeRun: j.activeRun,
      checkpoint: j.checkpoint,
      progress: {
        stage: j.progress?.stage,
        stageLabel: j.progress?.stageLabel,
        seedQuery: j.progress?.seedQuery,
        current: j.progress?.current,
        kept: j.progress?.kept,
        filtered: j.progress?.filtered,
        discoveryPlanNow: j.progress?.discoveryPlanNow,
        discoveryPlanQueue: j.progress?.discoveryPlanQueue,
        groupSharePct: j.progress?.groupSharePct,
      },
      decisions: j.decisions,
      growth: j.growth,
      hourly: j.hourly,
      recent50Fam: j.recent50Fam,
      jobs: {
        totalLast12h: j.jobs?.totalLast12h,
        buyerLast12h: j.jobs?.buyerLast12h,
        byStatus: j.jobs?.byStatus,
        retryishCount: j.jobs?.retryishCount,
        retryishSample: j.jobs?.retryishSample,
        timingsLast15: (j.jobs?.timings || []).slice(-15),
        midnightBuyerJobs: j.jobs?.midnightBuyerJobs,
      },
      otherRuns: j.otherRuns,
    },
    null,
    2
  )
);
console.log("ok", j.activeRun?.id, j.activeRun?.scanned, j.growth);
