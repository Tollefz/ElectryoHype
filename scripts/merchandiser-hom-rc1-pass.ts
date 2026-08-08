/**
 * Head of Merchandising RC1 — full catalog merchandising pass.
 *
 * Uses existing merchandiser helpers. No new storefront architecture.
 *
 * - Deduplicate near-identical SKUs (keep best, hide rest)
 * - Strip supplier number suffixes from titles
 * - Fix mismatched short descriptions
 * - Category corrections
 * - Soft-hide low-trust / off-identity products
 * - Assign merch grades A/B/C/D in tags (for Marketing Brain later)
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/merchandiser-hom-rc1-pass.ts --dry-run
 *   npx tsx -r dotenv/config scripts/merchandiser-hom-rc1-pass.ts --apply
 */

import { PrismaClient, Prisma } from "@prisma/client";
import slugify from "slugify";
import fs from "fs";
import path from "path";
import {
  buildMetaDescription,
  buildMetaTitle,
  decideUnpublish,
  norwegianRetailTitle,
  norwegianShortDescription,
  parseImages,
  priceAnomaly,
  suggestCategory,
  type MerchProduct,
} from "../lib/merchandiser/full-catalog-pass";
import { cleanProductName } from "../lib/utils/url-decode";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

type Grade = "A" | "B" | "C" | "D";

type Row = {
  id: string;
  name: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  shortDescription: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  price: number;
  compareAtPrice: number | null;
  supplierPrice: number | null;
  images: string;
  specs: unknown;
  tags: string;
  qualityScore: number | null;
  buyerLifecycle: string | null;
  stock: number;
};

type Report = {
  mode: string;
  analyzed: number;
  improved: Array<{ id: string; name: string; changes: string[] }>;
  hidden: Array<{ id: string; name: string; reason: string; grade: "D" }>;
  removed: []; // hard delete not used — soft hide only
  kept: number;
  grades: Record<Grade, number>;
  best: Array<{ id: string; name: string; grade: Grade; category: string | null; price: number; q: number | null }>;
  weakestKept: Array<{ id: string; name: string; grade: Grade; category: string | null; price: number }>;
  strongCategories: string[];
  thinCategories: string[];
  top25Market: string[];
  top25Frontpage: string[];
  top25Shopping: string[];
  top25Meta: string[];
  byCatAfter: Record<string, number>;
  priceFlags: Array<{ id: string; name: string; flag: string; price: number }>;
  dupeClustersCulled: Array<{ base: string; before: number; kept: number; hidden: number }>;
};

function parseTags(raw: string): string[] {
  try {
    const j = JSON.parse(raw || "[]");
    if (Array.isArray(j)) return j.map(String);
  } catch {
    /* ignore */
  }
  return raw ? [raw] : [];
}

function setMerchGrade(tags: string[], grade: Grade): string {
  const cleaned = tags.filter((t) => !/^merch:[ABCD]$/i.test(t));
  cleaned.push(`merch:${grade}`);
  return JSON.stringify([...new Set(cleaned)]);
}

function baseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/\s+\d{3,5}\b/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberSuffix(name: string): string {
  return name
    .replace(/\s+\d{3,5}\b/g, "")
    .replace(/\s*\(\s*\d+\s*g\s*\)/gi, "")
    .replace(/\s*\(\s*\d+\s*gram\s*\)/gi, "")
    .replace(/\bpremium\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasNumberSuffix(name: string): boolean {
  return /\b\d{3,5}\b/.test(name);
}

function mistranslatedShort(name: string, short: string | null): boolean {
  if (!short || short.trim().length < 20) return true;
  const n = name.toLowerCase();
  const s = short.toLowerCase();
  if (/musematte|mouse\s*pad|desk\s*pad|skrivebordsmatte/.test(n) && /\bmusen\b|gamingmus|dpi\b|ergonomisk design gjør musen/.test(s))
    return true;
  if (/\b(ruter|router|wifi)\b/.test(n) && /iphone|2\s*w\b|3\.5\s*mm|kompatibilitet:\s*iphone/.test(s))
    return true;
  if (/høyttaler|hoyttaler|speaker/.test(n) && /chargers?|kategori:\s*chargers/.test(s))
    return true;
  if (/powerbank|nødlader/.test(n) && /musematte|tastatur/.test(s)) return true;
  if (/lader|charger/.test(n) && !/powerbank/.test(n) && /musematte|dpi/.test(s)) return true;
  if (/webkamera|webcam/.test(n) && /musen|tastatur/.test(s)) return true;
  if (/pålitelig lading med stabil|best quality|factory|high quality|plastpose/i.test(s))
    return true;
  if (/tilkobling:\s*bluetooth\.\s*vekt:.*kategori:/i.test(s)) return true;
  if (/kompatibilitet:\s*iphone\.\s*mål:/i.test(s)) return true;
  return false;
}

/** Products that would not feel natural at Elkjøp/Power/Komplett accessories aisle. */
function softHideReason(p: Row): string | null {
  const hay = `${p.name} ${p.shortDescription || ""} ${p.subcategory || ""}`;
  if (/opening\s*repair|screwdriver\s*set|repair\s*tools?\s*kit|handskit/i.test(hay)) {
    return "Verktøysett / reparasjonskit — ikke butikkidentitet";
  }
  if (/green\s*skin\s*pro11|flat\s*protective\s*deksel\s*full\s*skjerm/i.test(hay)) {
    return "Uklar nettbrett-skin — lav tillit";
  }
  if (/apple\s*trådløs\s*controller\s*ps3|ps3ps2/i.test(hay)) {
    return "Uklar/misvisende kontroller";
  }
  if (/eat\s*chicken|honeycomb\s*shell|restaurant\s*pager/i.test(hay)) {
    return "AliExpress-tilfeldig";
  }
  if (/rechargeable\s*removable|10\.2\s*inch\s*nettbrett|unlocked\s*smartphone/i.test(hay)) {
    return "Uklar / mistranslatert gadget — lav tillit";
  }
  if (
    /\b(with|and|for|suitable|compatible|portable|adjustable|universal|removable|rechargeable)\b/i.test(
      p.name
    ) &&
    (p.name.match(/\b(with|and|for|suitable|compatible|portable|adjustable|universal|removable|rechargeable)\b/gi) || [])
      .length >= 2
  ) {
    return "Engelsk leverandørtittel — ikke klar for butikk";
  }
  if (/^\d+(\s|$)/.test(p.name.trim()) || p.name.trim().length < 4) {
    return "Ubrukelig tittel";
  }
  const imgs = parseImages(p.images);
  if (imgs.length === 0) return "Mangler produktbilder";
  if (p.price > 0 && p.price < 49) return "Useriøst lav pris for elektronikkbutikk";
  if (p.price > 8000 && (p.qualityScore == null || p.qualityScore < 70)) {
    return "Dyrt produkt uten tilstrekkelig tillitssignal";
  }
  return null;
}

function keepLimit(base: string, clusterSize: number): number {
  if (clusterSize <= 2) return clusterSize;
  if (clusterSize <= 4) return 2;
  // Commodity depth caps — assortment identity over volume
  if (/musematte|mouse\s*pad|desk\s*pad|skrivebord/.test(base)) return 5;
  if (/gaming[- ]?mus|tradlos mus|tradlost tastatur|tastatur|gaming[- ]?headset|hoyttaler|orepropper|webkamera/.test(base))
    return 5;
  if (/lader|powerbank|hub|dokking/.test(base)) return 4;
  return Math.min(4, Math.max(2, Math.ceil(clusterSize * 0.15)));
}

function rankScore(p: Row): number {
  const imgs = parseImages(p.images).length;
  const q = p.qualityScore ?? 50;
  const clean = hasNumberSuffix(p.name) ? -8 : 5;
  const priceOk = p.price >= 99 && p.price <= 1999 ? 8 : p.price >= 79 && p.price <= 2999 ? 3 : -5;
  const imgScore = Math.min(imgs, 8) * 3;
  return q + imgScore + clean + priceOk;
}

function assignGrade(p: Row, keptRankInCluster: number, clusterSize: number): Grade {
  const soft = softHideReason(p);
  if (soft) return "D";
  const q = p.qualityScore ?? 50;
  const imgs = parseImages(p.images).length;
  const cleanName = !hasNumberSuffix(p.name) && !/\brechargeable|removable|suitable\b/i.test(p.name);
  const coreCat = ["Gaming", "Mobil & Tilbehør", "Data & IT", "TV, Lyd & Bilde"].includes(
    p.category || ""
  );
  const trustPrice = p.price >= 149 && p.price <= 1999;

  // Flaggskip: tydelig, tillitsvekkende, ikke commodity-filler
  if (
    q >= 90 &&
    imgs >= 5 &&
    cleanName &&
    coreCat &&
    trustPrice &&
    keptRankInCluster <= 2 &&
    (clusterSize < 8 || keptRankInCluster === 1)
  ) {
    return "A";
  }
  if (q >= 80 && imgs >= 3 && cleanName && p.price >= 99 && p.price <= 2999) {
    if (clusterSize >= 12 && keptRankInCluster > 2) return "C";
    return "B";
  }
  if (q >= 60 && imgs >= 1 && p.price >= 79) return "C";
  return "D";
}

function preferredImages(imagesJson: string): string {
  const imgs = parseImages(imagesJson);
  if (imgs.length <= 1) return imagesJson;
  const scored = imgs.map((url, idx) => {
    let s = 100 - idx; // prefer original order mildly
    if (/_trans\.jpeg|_trans\.jpg/i.test(url)) s -= 15; // cutouts often weaker as hero
    if (/\.gif(\?|$)/i.test(url)) s -= 40;
    if (/quick\/product/i.test(url)) s -= 5;
    if (/\.png(\?|$)/i.test(url)) s += 5;
    return { url, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const ordered = scored.map((x) => x.url);
  // Only rewrite if hero changed
  if (ordered[0] === imgs[0]) return imagesJson;
  return JSON.stringify(ordered);
}

async function uniqueSlug(
  desired: string,
  productId: string,
  taken: Set<string>,
  owner: Map<string, string>
): Promise<string> {
  const base =
    slugify(desired, { lower: true, strict: true, locale: "nb" })
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || `produkt-${productId.slice(-8)}`;
  let slug = base;
  let n = 0;
  while (taken.has(slug) && owner.get(slug) !== productId) {
    n += 1;
    slug = `${base.slice(0, 55)}-${productId.slice(-6)}-${n}`;
  }
  // Release previous ownership tracking for this new slug
  taken.add(slug);
  owner.set(slug, productId);
  return slug;
}

function shortFor(p: Row, title: string): string {
  return norwegianShortDescription(p as unknown as MerchProduct, title);
}

async function main() {
  const report: Report = {
    mode: dryRun ? "dry-run" : "apply",
    analyzed: 0,
    improved: [],
    hidden: [],
    removed: [],
    kept: 0,
    grades: { A: 0, B: 0, C: 0, D: 0 },
    best: [],
    weakestKept: [],
    strongCategories: [],
    thinCategories: [],
    top25Market: [],
    top25Frontpage: [],
    top25Shopping: [],
    top25Meta: [],
    byCatAfter: {},
    priceFlags: [],
    dupeClustersCulled: [],
  };

  const products: Row[] = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      shortDescription: true,
      description: true,
      category: true,
      subcategory: true,
      price: true,
      compareAtPrice: true,
      supplierPrice: true,
      images: true,
      specs: true,
      tags: true,
      qualityScore: true,
      buyerLifecycle: true,
      stock: true,
    },
  });

  report.analyzed = products.length;

  const allSlugRows = await prisma.product.findMany({
    select: { id: true, slug: true },
  });
  const takenSlugs = new Set(allSlugRows.map((p) => p.slug));
  const slugOwner = new Map(allSlugRows.map((p) => [p.slug, p.id]));

  // --- Cluster duplicates ---
  const clusters = new Map<string, Row[]>();
  for (const p of products) {
    const b = baseName(p.name);
    if (!clusters.has(b)) clusters.set(b, []);
    clusters.get(b)!.push(p);
  }

  const hideIds = new Set<string>();
  const keepRank = new Map<string, { rank: number; size: number }>();

  for (const [base, list] of clusters) {
    const sorted = [...list].sort((a, b) => rankScore(b) - rankScore(a));
    const limit = keepLimit(base, sorted.length);
    if (sorted.length > limit) {
      const keep = sorted.slice(0, limit);
      const drop = sorted.slice(limit);
      report.dupeClustersCulled.push({
        base,
        before: sorted.length,
        kept: keep.length,
        hidden: drop.length,
      });
      for (const d of drop) {
        hideIds.add(d.id);
        report.hidden.push({
          id: d.id,
          name: d.name,
          reason: `Nær-duplikat av «${keep[0]!.name}» — beholder ${limit} beste i familien`,
          grade: "D",
        });
      }
      keep.forEach((p, i) => keepRank.set(p.id, { rank: i + 1, size: sorted.length }));
    } else {
      sorted.forEach((p, i) => keepRank.set(p.id, { rank: i + 1, size: sorted.length }));
    }
  }

  // Soft-hide off-identity
  for (const p of products) {
    if (hideIds.has(p.id)) continue;
    const dna = decideUnpublish(p as unknown as MerchProduct);
    if (dna?.unpublish) {
      hideIds.add(p.id);
      report.hidden.push({ id: p.id, name: p.name, reason: dna.reason, grade: "D" });
      continue;
    }
    const soft = softHideReason(p);
    if (soft) {
      hideIds.add(p.id);
      report.hidden.push({ id: p.id, name: p.name, reason: soft, grade: "D" });
    }
  }

  // Apply hides
  if (!dryRun && hideIds.size) {
    await prisma.product.updateMany({
      where: { id: { in: [...hideIds] } },
      data: {
        isActive: false,
        buyerLifecycle: "declining",
      },
    });
    // Tag D on hidden
    for (const id of hideIds) {
      const p = products.find((x) => x.id === id);
      if (!p) continue;
      await prisma.product.update({
        where: { id },
        data: { tags: setMerchGrade(parseTags(p.tags), "D") },
      });
    }
  }

  const survivors = products.filter((p) => !hideIds.has(p.id));
  const graded: Array<Row & { grade: Grade; title: string }> = [];

  for (const p of survivors) {
    const changes: string[] = [];
    const data: Prisma.ProductUpdateInput = {};
    let title = cleanProductName(p.name)
      .replace(/\s*\(\s*\d+\s*g\s*\)/gi, "")
      .replace(/\bpremium\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (title !== p.name && !hasNumberSuffix(p.name)) {
      // Soft cleanup without number strip
      const cleanedRetail = norwegianRetailTitle(title) || title;
      if (cleanedRetail !== p.name) {
        title = cleanedRetail;
        data.name = title;
        if (!dryRun) {
          takenSlugs.delete(p.slug);
          data.slug = await uniqueSlug(title, p.id, takenSlugs, slugOwner);
        }
        changes.push("tittel");
      }
    }

    if (hasNumberSuffix(title) || hasNumberSuffix(p.name)) {
      const stripped = stripNumberSuffix(title);
      title = norwegianRetailTitle(stripped) || stripped;
      if (title !== p.name) {
        data.name = title;
        if (!dryRun) {
          takenSlugs.delete(p.slug);
          data.slug = await uniqueSlug(title, p.id, takenSlugs, slugOwner);
        }
        changes.push("tittel");
      }
    } else {
      const retail = norwegianRetailTitle(title);
      if (retail && retail !== p.name && retail.length >= 4) {
        // Only apply if clearly cleaner (shorter supplier noise)
        if (retail.length < p.name.length - 5 || /factory|best seller|compatible with/i.test(p.name)) {
          title = retail;
          data.name = title;
          if (!dryRun) {
            takenSlugs.delete(p.slug);
            data.slug = await uniqueSlug(title, p.id, takenSlugs, slugOwner);
          }
          changes.push("tittel");
        }
      }
    }

    if (mistranslatedShort(title, p.shortDescription) || mistranslatedShort(p.name, p.shortDescription)) {
      data.shortDescription = shortFor({ ...p, name: title }, title);
      changes.push("beskrivelse");
    }

    const cat = suggestCategory({ ...p, name: title } as unknown as MerchProduct);
    if (cat && cat !== p.category) {
      data.category = cat;
      changes.push(`kategori→${cat}`);
    }

    const imgsNext = preferredImages(p.images);
    if (imgsNext !== p.images) {
      data.images = imgsNext;
      changes.push("bilde-rekkefølge");
    }

    const pa = priceAnomaly(p as unknown as MerchProduct);
    if (pa) {
      report.priceFlags.push({ id: p.id, name: title, flag: pa, price: p.price });
      if (pa === "urealistisk_rabatt" && p.compareAtPrice != null) {
        // Soften fake discount: set compare to ~20% above price
        data.compareAtPrice = Math.round(p.price * 1.2);
        changes.push("pris-compare");
      }
      if (pa === "compare_lavere_enn_pris") {
        data.compareAtPrice = null;
        changes.push("fjern-feil-compare");
      }
    }

    const kr = keepRank.get(p.id) || { rank: 1, size: 1 };
    // Grade against *post* title cleanliness
    const provisional: Row = {
      ...p,
      name: title,
      shortDescription:
        typeof data.shortDescription === "string"
          ? data.shortDescription
          : p.shortDescription,
      category: typeof data.category === "string" ? data.category : p.category,
      images: typeof data.images === "string" ? data.images : p.images,
    };
    let grade = assignGrade(provisional, kr.rank, kr.size);

    // Late D: still weak after fixes
    if (grade === "D") {
      hideIds.add(p.id);
      report.hidden.push({
        id: p.id,
        name: title,
        reason: "Lav tillit / konvertering etter merch-vurdering",
        grade: "D",
      });
      if (!dryRun) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            isActive: false,
            buyerLifecycle: "declining",
            tags: setMerchGrade(parseTags(p.tags), "D"),
            ...(data.name ? { name: data.name as string } : {}),
          },
        });
      }
      report.grades.D += 1;
      continue;
    }

    if (data.name || data.shortDescription) {
      data.metaTitle = buildMetaTitle(title);
      data.metaDescription = buildMetaDescription(
        title,
        (typeof data.shortDescription === "string"
          ? data.shortDescription
          : p.shortDescription) || ""
      );
      if (!changes.includes("seo")) changes.push("seo");
    }

    data.tags = setMerchGrade(parseTags(p.tags), grade);

    // Nudge quality for homepage algorithms (existing distribution uses qualityScore)
    if (grade === "A" && (p.qualityScore == null || p.qualityScore < 90)) {
      data.qualityScore = Math.max(p.qualityScore ?? 0, 92);
      changes.push("qualityScore");
    } else if (grade === "B" && (p.qualityScore == null || p.qualityScore < 78)) {
      data.qualityScore = Math.max(p.qualityScore ?? 0, 80);
    } else if (grade === "C" && p.qualityScore != null && p.qualityScore > 70) {
      // mild demotion so A/B own frontpage
      data.qualityScore = Math.min(p.qualityScore, 68);
    }

    report.grades[grade] += 1;
    graded.push({ ...provisional, grade, title });

    if (changes.length) {
      report.improved.push({ id: p.id, name: title, changes });
    }

    if (!dryRun) {
      await prisma.product.update({
        where: { id: p.id },
        data,
      });
    }
  }

  // Re-count D from hides
  report.grades.D = report.hidden.length;
  report.kept = graded.length;

  // Category strength
  const byCat: Record<string, number> = {};
  for (const g of graded) {
    const c = g.category || "Ukjent";
    byCat[c] = (byCat[c] || 0) + 1;
  }
  report.byCatAfter = byCat;
  report.strongCategories = Object.entries(byCat)
    .filter(([, n]) => n >= 40)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} (${n})`);
  report.thinCategories = Object.entries(byCat)
    .filter(([, n]) => n < 25)
    .sort((a, b) => a[1] - b[1])
    .map(([c, n]) => `${c} (${n})`);

  const ranked = [...graded].sort(
    (a, b) =>
      (a.grade === "A" ? 0 : a.grade === "B" ? 1 : 2) -
        (b.grade === "A" ? 0 : b.grade === "B" ? 1 : 2) ||
      (b.qualityScore ?? 0) - (a.qualityScore ?? 0) ||
      rankScore(b) - rankScore(a)
  );

  report.best = ranked.slice(0, 40).map((p) => ({
    id: p.id,
    name: p.title,
    grade: p.grade,
    category: p.category,
    price: p.price,
    q: p.qualityScore,
  }));

  report.weakestKept = [...graded]
    .filter((p) => p.grade === "C")
    .sort((a, b) => (a.qualityScore ?? 0) - (b.qualityScore ?? 0))
    .slice(0, 25)
    .map((p) => ({
      id: p.id,
      name: p.title,
      grade: p.grade,
      category: p.category,
      price: p.price,
    }));

  const pick25 = (filter: (p: (typeof graded)[0]) => boolean) =>
    ranked.filter(filter).slice(0, 25).map((p) => `${p.title} (${p.price} kr)`);

  report.top25Market = pick25((p) => p.grade === "A" || p.grade === "B");
  report.top25Frontpage = pick25(
    (p) =>
      (p.grade === "A" || p.grade === "B") &&
      !/musematte|mouse pad/i.test(p.title) // diversify home — mats are abundant
  );
  // If frontpage list short, backfill
  if (report.top25Frontpage.length < 25) {
    const extra = ranked
      .filter((p) => !report.top25Frontpage.some((t) => t.startsWith(p.title)))
      .slice(0, 25 - report.top25Frontpage.length)
      .map((p) => `${p.title} (${p.price} kr)`);
    report.top25Frontpage.push(...extra);
  }

  report.top25Shopping = pick25(
    (p) =>
      (p.grade === "A" || p.grade === "B") &&
      parseImages(p.images).length >= 3 &&
      p.price >= 149
  );
  report.top25Meta = pick25(
    (p) =>
      (p.grade === "A" || p.grade === "B") &&
      /gaming|mus|tastatur|headset|lader|powerbank|hub|øre|webkamera|dokking/i.test(
        p.title
      )
  );

  const out = path.join(process.cwd(), "tmp", "merch-hom-rc1-report.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        analyzed: report.analyzed,
        improved: report.improved.length,
        hidden: report.hidden.length,
        kept: report.kept,
        grades: report.grades,
        byCatAfter: report.byCatAfter,
        dupeClustersCulled: report.dupeClustersCulled.length,
        reportFile: out,
        sampleHidden: report.hidden.slice(0, 12),
        sampleImproved: report.improved.slice(0, 12),
        top10Market: report.top25Market.slice(0, 10),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
