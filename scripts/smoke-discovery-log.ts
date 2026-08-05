import {
  buildDiscoveryDecisionRecord,
  formatDiscoveryDecisionLog,
  buildDiscoverySummary,
} from "../lib/buyer/discovery-validation";

const chosen = {
  familyId: "gaming_keyboard",
  label: "Gamingtastatur",
  groupId: "pc_gaming",
  groupLabel: "Gaming",
  needScore: 88,
  reason: "Familien mangler helt i butikken",
  catalogHave: 0,
  target: 8,
  batchCount: 5,
  focusStars: 5,
  onCooldown: false,
  groupShare: 0.22,
  groupQuota: 0.3,
};
const mouse = {
  familyId: "gaming_mouse",
  label: "Gamingmus",
  groupId: "pc_gaming",
  groupLabel: "Gaming",
  needScore: 40,
  reason: "Balanserer sortiment",
  catalogHave: 3,
  target: 8,
  batchCount: 90,
  focusStars: 4,
  onCooldown: false,
  groupShare: 0.22,
  groupQuota: 0.3,
};
const d = buildDiscoveryDecisionRecord({
  chosen,
  ranked: [chosen, mouse],
  switchedFamily: true,
  pagesOnCurrent: 1,
  forceAdvance: false,
  query: "Mechanical Gaming Keyboard",
  observedByFamily: {
    gaming_keyboard: {
      shopMatchPct: 82,
      profitNOK: 120,
      marginPct: 48,
      deliveryDays: 9,
      supplierRiskPct: 5,
      demandScore: 70,
      inventoryScore: 75,
      merchScore: null,
      sampleCount: 12,
    },
  },
});
console.log(formatDiscoveryDecisionLog(d));
console.log("---");
const s = buildDiscoverySummary({
  scanRunId: "test",
  decisions: [d],
  familyScanCounts: { gaming_keyboard: 5, gaming_mouse: 90 },
  groupScanCounts: { pc_gaming: 95, mobil: 10 },
  familyLabels: {
    gaming_keyboard: "Gamingtastatur",
    gaming_mouse: "Gamingmus",
  },
});
console.log(s.text);
