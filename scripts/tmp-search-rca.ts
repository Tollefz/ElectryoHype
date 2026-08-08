/**
 * Principal Search Engineer — evidence harness (read-only).
 * Compares "should match" inventory vs current rankProductsForSearch.
 * Does NOT modify search logic.
 */
import { PrismaClient } from "@prisma/client";
import {
  filterByMinRelevance,
  parseSearchQuery,
  rankProductsForSearch,
} from "../lib/storefront/product-search.ts";

const prisma = new PrismaClient();

const QUERIES = [
  "deksel",
  "iphone",
  "iphone 15",
  "iphone deksel",
  "samsung",
  "galaxy",
  "mus",
  "musematte",
  "mus matte",
  "tastatur",
  "keyboard",
  "pc",
  "gaming pc",
  "laptop",
  "usb",
  "usb c",
  "lader",
  "headset",
] as const;

type Row = SearchableProduct & {
  id: string;
  createdAt?: Date;
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(tags: string): string[] {
  try {
    const p = JSON.parse(tags);
    if (Array.isArray(p)) return p.map((t) => String(t));
  } catch {
    /* */
  }
  return [];
}

type ExpectRule = {
  /** Human intent for "should match" */
  intent: string;
  /** Product should match if this returns true (catalog truth, not search algo) */
  shouldMatch: (p: Row, n: { name: string; sub: string; cat: string; tags: string; all: string }) => boolean;
  /** Strong expected product type for top-10 */
  strongMatch?: (p: Row, n: { name: string; sub: string; cat: string; tags: string; all: string }) => boolean;
};

function blob(p: Row) {
  const name = norm(p.name);
  const sub = norm(p.subcategory || "");
  const cat = norm(p.category || "");
  const tags = parseTags(p.tags).map(norm).join(" ");
  const meta = norm(p.metaTitle || "");
  const short = norm(p.shortDescription || "");
  return { name, sub, cat, tags, all: `${name} ${sub} ${cat} ${tags} ${meta} ${short}` };
}

const RULES: Record<string, ExpectRule> = {
  deksel: {
    intent: "Phone/tablet protective case (not keyboard dust cover)",
    shouldMatch: (_p, n) =>
      /\b(deksel|case|cover|etui|bumper|mobildeksel)\b/.test(n.name) ||
      n.sub.includes("mobildeksel") ||
      /\b(mobildeksel|phone case|iphone case)\b/.test(n.tags),
    strongMatch: (_p, n) =>
      /(telefon|phone|iphone|samsung|galaxy|mobil|nettbrett|tablet|ipad).{0,30}(deksel|case|cover|etui)/.test(
        n.name
      ) ||
      /(deksel|case|cover|etui).{0,30}(telefon|phone|iphone|samsung|galaxy|mobil|nettbrett|tablet|ipad)/.test(
        n.name
      ) ||
      /personvern\s*deksel|mobildeksel|phone\s*case/.test(n.name),
  },
  iphone: {
    intent: "Products for/compatible with iPhone",
    shouldMatch: (_p, n) => /\biphone\b/.test(n.all) || /\bapple\b/.test(n.name) && /deksel|case|lader|kabel|magsafe/.test(n.name),
    strongMatch: (_p, n) => /\biphone\b/.test(n.name),
  },
  "iphone 15": {
    intent: "iPhone 15 specific products",
    shouldMatch: (_p, n) => /iphone\s*15/.test(n.all) || (/iphone/.test(n.all) && /\b15\b/.test(n.all)),
    strongMatch: (_p, n) => /iphone\s*15/.test(n.name),
  },
  "iphone deksel": {
    intent: "iPhone cases",
    shouldMatch: (_p, n) =>
      (/\biphone\b/.test(n.all) && /\b(deksel|case|cover|etui)\b/.test(n.all)) ||
      /iphone.{0,20}(case|deksel)/.test(n.name),
    strongMatch: (_p, n) =>
      /\biphone\b/.test(n.name) && /\b(deksel|case|cover|etui)\b/.test(n.name),
  },
  samsung: {
    intent: "Samsung products / compatibility",
    shouldMatch: (_p, n) => /\bsamsung\b/.test(n.all) || /\bgalaxy\b/.test(n.all),
    strongMatch: (_p, n) => /\bsamsung\b/.test(n.name) || /\bgalaxy\b/.test(n.name),
  },
  galaxy: {
    intent: "Samsung Galaxy products",
    shouldMatch: (_p, n) => /\bgalaxy\b/.test(n.all) || (/\bsamsung\b/.test(n.all) && /deksel|case|phone/.test(n.all)),
    strongMatch: (_p, n) => /\bgalaxy\b/.test(n.name),
  },
  mus: {
    intent: "Computer mice (not primarily mouse pads)",
    shouldMatch: (_p, n) =>
      /(^|\s)(mus|mouse|gamingmus|spillmus)(\s|$)/.test(n.name) ||
      n.sub.includes("gamingmus") ||
      n.sub.includes("datamus") ||
      /\bgaming mus\b|\btrådløs mus\b|\btradlos mus\b/.test(n.tags),
    strongMatch: (_p, n) =>
      /(^|\s)(mus|mouse|gamingmus)(\s|$)/.test(n.name) &&
      !/musematte|mouse\s*pad|mousepad/.test(n.name),
  },
  musematte: {
    intent: "Mouse pads",
    shouldMatch: (_p, n) =>
      /musematte|mouse\s*pad|mousepad|desk\s*mat|desk\s*pad/.test(n.name) ||
      n.sub.includes("musematter") ||
      /musematte|mousepad|musematter/.test(n.tags),
    strongMatch: (_p, n) => /musematte|mouse\s*pad|mousepad/.test(n.name),
  },
  "mus matte": {
    intent: "Mouse pads (spaced Norwegian)",
    shouldMatch: (_p, n) =>
      /musematte|mouse\s*pad|mousepad|desk\s*mat/.test(n.name) ||
      n.sub.includes("musematter") ||
      /musematte|mousepad/.test(n.tags),
    strongMatch: (_p, n) => /musematte|mouse\s*pad|mousepad/.test(n.name),
  },
  tastatur: {
    intent: "Keyboards",
    shouldMatch: (_p, n) =>
      /\btastatur\b|\bkeyboard\b/.test(n.name) ||
      n.sub === "tastatur" ||
      n.sub.includes("tastatur") ||
      /\btastatur\b|\bkeyboard\b/.test(n.tags),
    strongMatch: (_p, n) =>
      /\btastatur\b|\bkeyboard\b/.test(n.name) &&
      !/dust|deksel|cover|tray|desk|skrivebord/.test(n.name),
  },
  keyboard: {
    intent: "Keyboards (EN synonym)",
    shouldMatch: (_p, n) =>
      /\btastatur\b|\bkeyboard\b/.test(n.name) ||
      n.sub.includes("tastatur") ||
      /\btastatur\b|\bkeyboard\b/.test(n.tags),
    strongMatch: (_p, n) =>
      /\btastatur\b|\bkeyboard\b/.test(n.name) &&
      !/dust|deksel|cover|tray|desk/.test(n.name),
  },
  pc: {
    intent: "Computers / PCs / tablets sold as PC — not peripherals mentioning PC",
    shouldMatch: (_p, n) =>
      /\bgaming\s*pc\b|\bmini\s*pc\b|\bdesktop\b|\bstasjon|\btablet\s*pc\b|\blaptop\b|\bnotebook\b/.test(
        n.name
      ) ||
      (n.sub === "laptop" && !/mus|mouse|tastatur|keyboard|stativ/.test(n.name)) ||
      (/\bpc\b/.test(n.name) &&
        !/\b(mus|mouse|tastatur|keyboard|controller|gamepad|headset|optical)\b/.test(n.name)),
    strongMatch: (_p, n) =>
      /\bgaming\s*pc\b|\bmini\s*pc\b|\bdesktop\b|\btablet\s*pc\b/.test(n.name) ||
      (/\blaptop\b|\bnotebook\b/.test(n.name) &&
        !/stativ|mus|mouse|tastatur|keyboard|cooler|sleeve/.test(n.name)),
  },
  "gaming pc": {
    intent: "Gaming desktop/PC systems",
    shouldMatch: (_p, n) =>
      /gaming\s*pc|gamer\s*pc|spillpc|gaming\s*desktop|gaming\s*computer/.test(n.all) ||
      (/gaming/.test(n.name) && /\b(pc|desktop|tower|stasjon)/.test(n.name) && !/mus|mouse|tastatur|keyboard|headset|chair|stol/.test(n.name)),
    strongMatch: (_p, n) => /gaming\s*pc|gamer\s*pc|spillpc/.test(n.name),
  },
  laptop: {
    intent: "Laptop computers (not stands/mice for laptop)",
    shouldMatch: (_p, n) =>
      (/\blaptop\b|\bnotebook\b|\bbaerbar\b/.test(n.name) &&
        !/stativ|stand|cooler|sleeve|bag|mus|mouse|tastatur|keyboard|gamepad/.test(n.name)) ||
      (n.sub === "laptop" && !/mus|mouse|tastatur|stativ/.test(n.name)) ||
      /\btablet\s*pc\b/.test(n.name),
    strongMatch: (_p, n) =>
      (/\blaptop\b|\bnotebook\b/.test(n.name) &&
        !/stativ|stand|cooler|sleeve|mus|mouse|tastatur|keyboard/.test(n.name)) ||
      /\btablet\s*pc\b/.test(n.name),
  },
  usb: {
    intent: "USB products",
    shouldMatch: (_p, n) => /\busb\b/.test(n.name) || /\busb\b/.test(n.tags) || /\busb\b/.test(n.sub),
    strongMatch: (_p, n) => /\busb\b/.test(n.name),
  },
  "usb c": {
    intent: "USB-C products",
    shouldMatch: (_p, n) =>
      /usb\s*c|usb\-c|usbc|type\s*c/.test(n.name) ||
      /usb\s*c|usb\-c|usbc/.test(n.tags) ||
      /usb\s*c|usb\-c/.test(n.all),
    strongMatch: (_p, n) => /usb\s*c|usbc|type\s*c/.test(n.name),
  },
  lader: {
    intent: "Chargers (wall/wireless/car) — not random 'charging' peripherals",
    shouldMatch: (_p, n) =>
      /\blader\b|\bcharger\b|hurtiglader|vegglader|billader|powerbank|trådløs lading|tradlos lading|wireless charg/.test(
        n.name
      ) ||
      n.sub.includes("lader") ||
      n.sub.includes("trådløs lading") ||
      n.sub.includes("tradlos lading") ||
      n.sub.includes("powerbank"),
    strongMatch: (_p, n) =>
      /\blader\b|\bcharger\b|hurtiglader|powerbank/.test(n.name) &&
      !/musematte|mus\b|tastatur|keyboard|kontroller|gamepad/.test(n.name),
  },
  headset: {
    intent: "Headsets / headphones",
    shouldMatch: (_p, n) =>
      /\bheadset\b|\bhodetelefon|\bearbuds\b|\børeprop/.test(n.name) ||
      n.sub.includes("headset") ||
      /\bheadset\b|\bhodetelefon/.test(n.tags),
    strongMatch: (_p, n) =>
      /\bheadset\b|\bhodetelefon|\bearbuds\b/.test(n.name) &&
      !/tastatur|keyboard|\bmus\b|\bmouse\b/.test(n.name),
  },
};

function causeWhyMissing(
  q: string,
  p: Row,
  n: ReturnType<typeof blob>,
  scoredIds: Set<string>,
  scoreMap: Map<string, number>,
  parsed: ReturnType<typeof parseSearchQuery>
): { causes: string[]; detail: string } {
  const causes: string[] = [];
  const nameHasLiteral =
    n.name.includes(norm(q)) ||
    q.split(/\s+/).every((t) => t.length > 1 && n.name.includes(norm(t)));

  // Title language / wording
  if (!nameHasLiteral && /deksel|case|mus|tastatur|keyboard|pc|laptop|lader|headset|iphone|samsung|usb/.test(q)) {
    if (q === "mus matte" && /musematte/.test(n.name)) {
      causes.push("feil søkelogikk"); // historically; current may compound
    } else if (q === "keyboard" && /tastatur/.test(n.name) && !/keyboard/.test(n.name)) {
      causes.push("feil tittel"); // EN query vs NO title — also søkelogikk if synonym fails
      causes.push("relevansscore");
    } else if (!/\biphone\b|\bsamsung\b|\bgalaxy\b|\bdeksel\b|\bcase\b/.test(n.name) && /(iphone|samsung|deksel)/.test(q)) {
      causes.push("feil tittel");
    }
  }

  if (n.sub && /mobildeksel|tastatur|musematter|laptop|lader/.test(n.sub)) {
    // check pollution: subcategory contradicts title
    if (n.sub.includes("mobildeksel") && !/deksel|case|cover|etui|phone|telefon|iphone|samsung/.test(n.name)) {
      causes.push("feil kategori");
      causes.push("feil tagger");
    }
  }

  const tags = parseTags(p.tags).map(norm);
  const noisyTag =
    tags.includes("mobildeksel") && !/deksel|case|cover|phone|telefon/.test(n.name);
  if (noisyTag) {
    causes.push("feil tagger");
  }

  if (!scoredIds.has(p.id)) {
    // Not returned at all
    if (parsed?.intent === "phone_case" || parsed?.intent === "pc" || parsed?.intent === "mouse_pad") {
      causes.push("filtrering");
      causes.push("relevansscore");
    }
    if (q.includes(" ") && !n.name.includes(norm(q))) {
      causes.push("feil søkelogikk");
    }
    // literal name match would have worked with old contains
    if (n.name.includes(norm(q.replace(/\s+/g, ""))) || n.name.includes(norm(q))) {
      causes.push("filtrering");
    } else if (tags.some((t) => t.includes(norm(q)) || norm(q).includes(t))) {
      causes.push("feil søkelogikk"); // tags not trusted / not enough
      causes.push("feil tagger");
    } else {
      causes.push("feil tittel");
      causes.push("feil metadata");
    }
  } else {
    const score = scoreMap.get(p.id) || 0;
    const ranked = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
    const pos = ranked.findIndex(([id]) => id === p.id) + 1;
    if (pos > 10) {
      causes.push("relevansscore");
      if (noisyTag || (n.sub.includes("mobildeksel") && !/deksel|case/.test(n.name))) {
        causes.push("feil metadata");
      }
    }
  }

  if (causes.length === 0) causes.push("annen årsak");

  const unique = [...new Set(causes)];
  return {
    causes: unique,
    detail: `score=${scoreMap.get(p.id) ?? "ABSENT"} intent=${parsed?.intent || "?"} sub=${p.subcategory || "null"} tags=${tags.slice(0, 6).join(",")}`,
  };
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      storeId: "default-store",
      category: { notIn: ["Sport & Trening", "Klær", "Sport"] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      category: true,
      subcategory: true,
      tags: true,
      metaTitle: true,
      shortDescription: true,
      isActive: true,
    },
  });

  const rows: Row[] = products.map((p) => ({
    ...p,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
  }));

  console.log(JSON.stringify({ catalogSize: rows.length }, null, 0));
  console.log("---");

  const report: unknown[] = [];

  for (const q of QUERIES) {
    const rule = RULES[q]!;
    const expected: Array<{ p: Row; n: ReturnType<typeof blob>; strong: boolean }> = [];
    for (const p of rows) {
      const n = blob(p);
      if (rule.shouldMatch(p, n)) {
        expected.push({ p, n, strong: rule.strongMatch ? rule.strongMatch(p, n) : false });
      }
    }

    const parsed = parseSearchQuery(q);
    const rankedAll = rankProductsForSearch(rows, q);
    const ranked = filterByMinRelevance(rankedAll);
    const scoreMap = new Map(rankedAll.map((r) => [r.id, r.searchScore]));
    const scoredIds = new Set(ranked.map((r) => r.id));

    const expectedIds = new Set(expected.map((e) => e.p.id));
    const strongExpected = expected.filter((e) => e.strong);
    const strongInTop10 = strongExpected.filter((e) => {
      const idx = ranked.findIndex((r) => r.id === e.p.id);
      return idx >= 0 && idx < 10;
    });
    const strongMissing = strongExpected.filter((e) => !scoredIds.has(e.p.id));
    const strongBuried = strongExpected.filter((e) => {
      const idx = ranked.findIndex((r) => r.id === e.p.id);
      return idx >= 10;
    });

    const falsePositives = ranked.slice(0, 10).filter((r) => !expectedIds.has(r.id));

    // Name-only contains baseline (old search)
    const oldContains = rows.filter((p) =>
      norm(p.name).includes(norm(q))
    );

    // Sample missing strong with causes
    const missingSamples = [...strongMissing, ...strongBuried]
      .slice(0, 8)
      .map((e) => {
        const why = causeWhyMissing(q, e.p, e.n, scoredIds, scoreMap, parsed);
        return {
          id: e.p.id,
          name: e.p.name,
          category: e.p.category,
          subcategory: e.p.subcategory,
          tags: parseTags(e.p.tags).slice(0, 8),
          metaTitle: e.p.metaTitle,
          strong: e.strong,
          inResults: scoredIds.has(e.p.id),
          score: scoreMap.get(e.p.id) ?? null,
          rank: ranked.findIndex((r) => r.id === e.p.id) + 1 || null,
          causes: why.causes,
          detail: why.detail,
        };
      });

    // Also: products that SHOULD match on tags/sub but title lacks query word
    const metadataOnly = expected
      .filter((e) => e.strong === false)
      .filter((e) => !norm(e.p.name).includes(norm(q.split(" ")[0]!)))
      .slice(0, 5)
      .map((e) => ({
        id: e.p.id,
        name: e.p.name,
        category: e.p.category,
        subcategory: e.p.subcategory,
        tags: parseTags(e.p.tags).slice(0, 8),
        inResults: scoredIds.has(e.p.id),
        score: scoreMap.get(e.p.id) ?? null,
      }));

    const falsePosSamples = falsePositives.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      subcategory: r.subcategory,
      tags: parseTags(r.tags).slice(0, 8),
      score: r.searchScore,
    }));

    const causeCounts: Record<string, number> = {};
    for (const s of missingSamples) {
      for (const c of s.causes) {
        causeCounts[c] = (causeCounts[c] || 0) + 1;
      }
    }

    const entry = {
      query: q,
      intentDescribed: rule.intent,
      parsedIntent: parsed?.intent ?? null,
      parsedTokens: parsed?.tokens ?? [],
      catalogShouldMatch: expected.length,
      catalogStrongShouldMatch: strongExpected.length,
      searchReturned: ranked.length,
      searchReturnedBeforeFloor: rankedAll.length,
      oldNameContainsCount: oldContains.length,
      strongInTop10: strongInTop10.length,
      strongMissingCount: strongMissing.length,
      strongBuriedCount: strongBuried.length,
      falsePositivesInTop10: falsePositives.length,
      top10: ranked.slice(0, 10).map((r, i) => ({
        rank: i + 1,
        id: r.id,
        name: r.name,
        category: r.category,
        subcategory: r.subcategory,
        score: r.searchScore,
        expected: expectedIds.has(r.id),
        strong: strongExpected.some((e) => e.p.id === r.id),
      })),
      missingOrBuriedStrongSamples: missingSamples,
      metadataOnlyShouldMatchSamples: metadataOnly,
      falsePositiveTopSamples: falsePosSamples,
      causeCountsOnMissingStrong: causeCounts,
    };

    report.push(entry);
    console.log(
      JSON.stringify({
        q,
        should: expected.length,
        strong: strongExpected.length,
        returned: ranked.length,
        oldContains: oldContains.length,
        strongTop10: strongInTop10.length,
        strongMiss: strongMissing.length,
        strongBuried: strongBuried.length,
        fpTop10: falsePositives.length,
        top: ranked.slice(0, 5).map((r) => r.name),
      })
    );
  }

  // Catalog inventory snapshots for key product types
  const inventory = {
    nameContainsDeksel: rows.filter((p) => norm(p.name).includes("deksel")).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      tags: parseTags(p.tags).slice(0, 6),
    })),
    nameContainsIphone: rows.filter((p) => norm(p.name).includes("iphone")).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
    })),
    nameContainsIphone15: rows.filter((p) => /iphone\s*15/.test(norm(p.name))),
    nameContainsSamsung: rows.filter((p) => norm(p.name).includes("samsung")),
    nameContainsGalaxy: rows.filter((p) => norm(p.name).includes("galaxy")),
    nameContainsMusematte: rows.filter((p) => norm(p.name).includes("musematte")).length,
    nameContainsMusMatte: rows.filter((p) => norm(p.name).includes("mus matte")).length,
    nameContainsTastatur: rows.filter((p) => norm(p.name).includes("tastatur")).length,
    nameContainsKeyboard: rows.filter((p) => norm(p.name).includes("keyboard")).length,
    nameContainsGamingPc: rows.filter((p) => /gaming\s*pc/.test(norm(p.name))).length,
    nameWordPc: rows.filter((p) => /(^|\s)pc(\s|$)/.test(norm(p.name))).map((p) => p.name),
    subMobildeksel: rows.filter((p) => norm(p.subcategory || "") === "mobildeksel").length,
    subMobildekselButNotCase: rows
      .filter((p) => norm(p.subcategory || "") === "mobildeksel")
      .filter((p) => !/\b(deksel|case|cover|etui)\b/.test(norm(p.name)))
      .slice(0, 15)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        tags: parseTags(p.tags).slice(0, 6),
      })),
    tagsContainMobildeksel: rows.filter((p) =>
      parseTags(p.tags).some((t) => norm(t).includes("mobildeksel") || norm(t) === "deksel")
    ).length,
  };

  const out = { generatedAt: new Date().toISOString(), catalogSize: rows.length, inventory, queries: report };
  const fs = await import("fs");
  fs.writeFileSync("scripts/.search-rca-report.json", JSON.stringify(out, null, 2), "utf8");
  console.log("WROTE scripts/.search-rca-report.json");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
