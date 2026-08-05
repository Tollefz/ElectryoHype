/**
 * Verify frontpage curation: 0 automotive / jump-starter / workshop on curated surfaces.
 */
import { DEFAULT_STORE_ID } from "../lib/store";
import {
  distributeHomeProducts,
  findDuplicateSectionIds,
} from "../lib/storefront/home-product-distribution";
import {
  isFrontpageExcluded,
  frontpageExclusionReason,
  productFamilyKey,
  imageFingerprint,
  normalizeMatchText,
} from "../lib/storefront/curation";

const AUTOMOTIVE_QA =
  /\b(jump\s*starter|jumper\s*starter|jump\s*pack|battery\s*booster|car\s*booster|car\s*jump|portable\s*car\s*starter|vehicle\s*starter|auto\s*starter|starthjelp|bilbatteri|hydraulic|porta\s*power|automotive|workshop|garage\s*tool|dent\s*repair|booster\s*(?:battery|pack|cable)|emergency\s*(?:starter|battery)|taillight|tail\s*light|brake\s*(?:lamp|light)|headlight|fog\s*(?:lamp|light)|rear\s*brake)\b/;

async function main() {
  const storeId = process.env.STORE_ID || DEFAULT_STORE_ID;
  const result = await distributeHomeProducts(storeId);
  const dups = findDuplicateSectionIds(result.sections);

  const all = Object.entries(result.sections).flatMap(([section, products]) =>
    products.map((p) => ({ section, ...p }))
  );

  const excludedHits = all.filter((p) => isFrontpageExcluded(p));
  const automotiveHits = all.filter((p) =>
    AUTOMOTIVE_QA.test(normalizeMatchText(`${p.name} ${p.slug} ${p.category || ""}`))
  );

  const familyCollisions: Array<{
    section: string;
    family: string;
    names: string[];
  }> = [];
  for (const [section, products] of Object.entries(result.sections)) {
    const byFam = new Map<string, string[]>();
    for (const p of products) {
      const fam = productFamilyKey(p);
      const list = byFam.get(fam) || [];
      list.push(p.name);
      byFam.set(fam, list);
    }
    for (const [family, names] of byFam) {
      if (names.length > 1) familyCollisions.push({ section, family, names });
    }
  }

  const imageCollisions: Array<{ section: string; names: string[] }> = [];
  for (const [section, products] of Object.entries(result.sections)) {
    const byImg = new Map<string, string[]>();
    for (const p of products) {
      const img = imageFingerprint(p.images);
      if (!img) continue;
      const list = byImg.get(img) || [];
      list.push(p.name);
      byImg.set(img, list);
    }
    for (const [, names] of byImg) {
      if (names.length > 1) imageCollisions.push({ section, names });
    }
  }

  const report = {
    storeId,
    totalSlotsFilled: all.length,
    uniqueIds: new Set(all.map((p) => p.id)).size,
    automotiveCount: automotiveHits.length,
    ok:
      dups.length === 0 &&
      excludedHits.length === 0 &&
      automotiveHits.length === 0 &&
      familyCollisions.length === 0 &&
      imageCollisions.length === 0,
    duplicates: dups,
    automotiveProducts: automotiveHits.map((p) => ({
      section: p.section,
      name: p.name,
      slug: p.slug,
      reason: frontpageExclusionReason(p) || "qa-pattern-missed-by-excluder",
    })),
    excludedHitsStillPresent: excludedHits.map((p) => ({
      section: p.section,
      name: p.name,
      reason: frontpageExclusionReason(p),
    })),
    familyCollisions,
    imageCollisions,
    sections: Object.fromEntries(
      Object.entries(result.sections).map(([k, products]) => [
        k,
        products.map((p) => ({
          name: p.name.slice(0, 60),
          category: p.category,
          family: productFamilyKey(p),
          price: p.price,
        })),
      ])
    ),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
