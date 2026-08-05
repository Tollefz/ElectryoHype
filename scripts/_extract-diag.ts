import fs from "fs";

const raw = fs.readFileSync("scripts/_diag-out.json", "utf8").replace(/^\uFEFF/, "");
const j = JSON.parse(raw);
const pick = {
  meta: j.meta,
  discoveryAttribution: j.discoveryAttribution,
  discoveryPlanNow: j.discoveryPlanNow,
  recentDecisionsCount: (j.recentDecisions || []).length,
  recentDecisions: (j.recentDecisions || []).slice(-15),
  top100ByFam: j.top100ByFam,
  gaming: {
    count: j.clusters.gamingPeripherals.count,
    top100: j.clusters.gamingPeripherals.top100,
    after100: j.clusters.gamingPeripherals.after100,
    disc: j.clusters.gamingPeripherals.discoveryAttributed,
    avgMerch: j.clusters.gamingPeripherals.avgMerch,
    avgMatch: j.clusters.gamingPeripherals.avgMatch,
    avgAss: j.clusters.gamingPeripherals.avgAssortment,
    avgFocus: j.clusters.gamingPeripherals.avgFocus,
    avgMargin: j.clusters.gamingPeripherals.avgMargin,
    rows: j.clusters.gamingPeripherals.rows,
  },
  target: {
    count: j.clusters.targetAccessories.count,
    top100: j.clusters.targetAccessories.top100,
    after100: j.clusters.targetAccessories.after100,
    disc: j.clusters.targetAccessories.discoveryAttributed,
    avgMerch: j.clusters.targetAccessories.avgMerch,
    avgMatch: j.clusters.targetAccessories.avgMatch,
    avgAss: j.clusters.targetAccessories.avgAssortment,
    avgFocus: j.clusters.targetAccessories.avgFocus,
    avgMargin: j.clusters.targetAccessories.avgMargin,
    rows: j.clusters.targetAccessories.rows,
  },
  familyTop20: j.familyTable.slice(0, 20).map((f: Record<string, unknown>) => ({
    id: f.id,
    label: f.label,
    count: f.count,
    top100: f.top100,
    after100: f.after100,
    unranked: f.unranked,
    disc: f.discoveryAttributed,
    avgMerch: f.avgMerch,
    avgMatch: f.avgMatch,
    avgAss: f.avgAssortment,
    avgFocus: f.avgFocus,
    avgMargin: f.avgMargin,
  })),
  chronology: j.chronology,
  samples: j.samples,
};
fs.writeFileSync("scripts/_diag-pick.json", JSON.stringify(pick, null, 2));
console.log("wrote scripts/_diag-pick.json");
console.log("candidates", j.meta.candidateRows, "top100 families", j.top100ByFam?.length);
