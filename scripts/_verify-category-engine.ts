/**
 * Verify Category Intelligence V2.
 * Run: npx tsx scripts/_verify-category-engine.ts
 */

import {
  assertMainCategory,
  inferMainAndSub,
  isValidSubcategory,
  listSubsFor,
  normalizeLegacyCategory,
  normalizeSubcategory,
} from "../lib/categories/tree";
import { getAllDbValues } from "../lib/categories";
import { AI_CATEGORY_AUTO_MIN } from "../lib/admin/ai-categorize-constants";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK:", msg);
  }
}

function expectMain(title: string, expected: string) {
  const result = inferMainAndSub(title);
  assert(
    result.main === expected,
    `"${title}" → ${expected} (got ${result.main} / ${result.subcategory}, conf ${result.confidence})`
  );
}

function main() {
  console.log("=== Category Intelligence V2 verification ===\n");

  const allowlist = getAllDbValues();
  assert(allowlist.length === 6, `Allowlist has 6 mains (got ${allowlist.length})`);
  assert(AI_CATEGORY_AUTO_MIN === 90, "AUTO_MIN is 90");

  // Legacy normalization
  assert(
    normalizeLegacyCategory("Elektronikk") === "Hjem & Fritid",
    "Elektronikk → Hjem & Fritid"
  );
  assert(normalizeLegacyCategory("TV & Lyd") === "TV, Lyd & Bilde", "TV & Lyd mapped");
  assert(assertMainCategory("Elektronikk") === null, "assertMain rejects Elektronikk");

  // Production spot-checks (must never fail)
  console.log("\n-- Spot checks --");
  expectMain("Gaming Phone Case", "Mobil & Tilbehør");
  expectMain("MagSafe Charger", "Mobil & Tilbehør");
  expectMain("RGB Mouse Pad", "Gaming");
  expectMain("Gaming Mouse", "Gaming");
  expectMain("Bluetooth Speaker", "TV, Lyd & Bilde");
  expectMain("LED Rose Lamp", "Hjem & Fritid");

  // Extra function-first cases from the brief
  expectMain("Gaming RGB Phone Charger", "Mobil & Tilbehør");
  expectMain("Wireless Gaming Earbuds", "TV, Lyd & Bilde");
  expectMain("Breathable Magnetic Suction Gaming Phone Case", "Mobil & Tilbehør");

  const mouse = inferMainAndSub("Gaming Mouse");
  assert(
    mouse.subcategory === "Gamingmus" ||
      listSubsFor("Gaming").includes(mouse.subcategory || ""),
    `Gaming Mouse sub valid (got ${mouse.subcategory})`
  );

  const pad = inferMainAndSub("RGB Mouse Pad");
  assert(
    pad.subcategory === "Musematter",
    `RGB Mouse Pad → Musematter (got ${pad.subcategory})`
  );

  // Aliases
  assert(
    normalizeSubcategory("Mobil & Tilbehør", "Deksler") === "Mobildeksel",
    "Deksler → Mobildeksel"
  );
  assert(
    normalizeSubcategory("Gaming", "Mus") === "Gamingmus",
    "Mus → Gamingmus"
  );
  assert(isValidSubcategory("Gaming", "Gamingmus"), "Gamingmus valid");
  assert(!isValidSubcategory("Gaming", "Powerbank"), "Powerbank not under Gaming");

  for (const mainCat of allowlist) {
    const subs = listSubsFor(mainCat);
    assert(subs.length > 0, `${mainCat} has subcategories (${subs.length})`);
  }

  const a = inferMainAndSub("Gaming Phone Case");
  const b = inferMainAndSub("Gaming Phone Case");
  assert(a.main === b.main && a.subcategory === b.subcategory, "Heuristic is deterministic");

  console.log("\n=== Done ===");
  if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log("All checks passed.");
}

main();
