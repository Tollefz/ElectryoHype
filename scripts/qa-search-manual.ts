/**
 * QA Lead — storefront search quality harness (≥100 queries).
 * Read-only. Does not modify search logic.
 *
 * Run: npx tsx scripts/qa-search-manual.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import {
  filterByMinRelevance,
  parseSearchQuery,
  rankProductsForSearch,
} from "../lib/storefront/product-search.ts";

const prisma = new PrismaClient();

const QUERIES: string[] = [
  // Brand / phone
  "iphone",
  "iphone deksel",
  "iphone 15",
  "iphone lader",
  "samsung",
  "samsung deksel",
  "galaxy",
  "galaxy deksel",
  "ipad",
  "ipad deksel",
  "magsafe",
  "airpods",
  // Cables / USB / charging
  "usb",
  "usb c",
  "usb-c",
  "usbc",
  "ladekabel",
  "usb c kabel",
  "lightning",
  "lader",
  "hurtiglader",
  "trådløs lader",
  "powerbank",
  "nødlader",
  "billader",
  "vegglader",
  "qi lader",
  // Mouse / pad / keyboard
  "mus",
  "gaming mus",
  "trådløs mus",
  "datamus",
  "mus matte",
  "musematte",
  "rgb musematte",
  "mouse pad",
  "tastatur",
  "gaming tastatur",
  "mekanisk tastatur",
  "trådløst tastatur",
  "keyboard",
  "mechanical keyboard",
  // PC / laptop
  "pc",
  "gaming pc",
  "laptop",
  "bærbar",
  "minipc",
  "mini pc",
  "dokkingstasjon",
  "hub",
  "usb hub",
  "usb-c hub",
  "laptopstativ",
  // Audio
  "hodetelefon",
  "hodetelefoner",
  "headset",
  "gaming headset",
  "ørepropper",
  "earbuds",
  "høyttaler",
  "bluetooth høyttaler",
  "soundbar",
  "mikrofon",
  "kondensatormikrofon",
  // Controllers / gaming
  "kontroller",
  "gamepad",
  "spillkontroller",
  "ps5",
  "xbox",
  // Display / AV
  "projektor",
  "skjerm",
  "monitor",
  "tv",
  "tv feste",
  "webkamera",
  "webcam",
  // Home / appliances (may be empty — document gaps)
  "airfryer",
  "air fryer",
  "støvsuger",
  "robotstøvsuger",
  "kaffemaskin",
  "smartklokke",
  "smartwatch",
  "vifte",
  "lampe",
  "led",
  "led list",
  "smart hjem",
  "wifi stikkontakt",
  // Misc accessories
  "skjermbeskytter",
  "herdet glass",
  "mobilholder",
  "telefonholder",
  "stativ",
  "kabelholder",
  "rgb",
  "gaming",
  "trådløs",
  "bluetooth",
  "wifi",
  "ruter",
  "nettbrett",
  "tablet",
  "ssd",
  "harddisk",
  "kortleser",
  "adapter",
  "lightning adapter",
  "usb c adapter",
  // Norwegian natural language
  "lader til telefon",
  "mus til pc",
  "tastatur til gaming",
  "deksel",
  "telefon deksel",
  "mobildeksel",
  "case",
  "cover",
  "etui",
  "oplader",
  "batteri bank",
  "ekstra batteri",
  "spill mus",
  "spilltastatur",
  "lyd",
  "mikrofon til streaming",
  "streaming",
  "capture card",
];

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

type Expect = {
  /** Title patterns that make a strong relevant hit */
  good: RegExp[];
  /** Title patterns that are clear false positives for this query */
  bad?: RegExp[];
  /** Catalog may honestly be empty */
  allowEmpty?: boolean;
};

function expectations(q: string): Expect {
  const n = norm(q);

  if (n === "deksel" || n === "mobildeksel" || n === "telefon deksel" || n === "case" || n === "cover" || n === "etui") {
    return {
      good: [/deksel|case|cover|etui|telefon/],
      bad: [/tastatur.{0,20}deksel|dust|keyboard.{0,15}cover|datamus|^mus\b/i],
    };
  }
  if (n.includes("iphone") && n.includes("deksel")) {
    return {
      good: [/iphone|telefon|deksel|case/],
      bad: [/powerbank|lader|musematte|tastatur/],
      allowEmpty: true,
    };
  }
  if (n.startsWith("iphone")) {
    return {
      good: [/iphone|apple|magsafe/],
      bad: [/musematte|datamus|tastatur dust/],
      allowEmpty: n.includes("15"),
    };
  }
  if (n.includes("samsung") || n === "galaxy" || n.includes("galaxy")) {
    return {
      good: [/samsung|galaxy/],
      bad: [/musematte|datamus/],
      allowEmpty: true,
    };
  }
  if (n.includes("ipad")) {
    return {
      good: [/ipad|nettbrett|tablet|deksel|mappe/],
      allowEmpty: true,
    };
  }
  if (n.includes("musematte") || n.includes("mus matte") || n.includes("mouse pad")) {
    return {
      good: [/musematte|mouse\s*pad|mousepad|desk\s*mat/],
      bad: [/^(trådløs\s*)?mus\b(?!ematte)|gaming-mus|datamus/i],
    };
  }
  if (
    (n === "mus" ||
      n.includes("gaming mus") ||
      n.includes("tradlos mus") ||
      n.includes("trådløs mus") ||
      n === "datamus" ||
      n === "spill mus") &&
    !n.includes("matte")
  ) {
    return {
      good: [/\bmus\b|\bmouse\b|gamingmus|datamus/],
      bad: [/musematte|mouse\s*pad/],
    };
  }
  if (n.includes("tastatur") || n.includes("keyboard")) {
    return {
      good: [/tastatur|keyboard/],
      bad: [/piano\s*bench|chair|dust\s*deksel|musematte/],
    };
  }
  if (n === "pc" || n === "gaming pc" || n.includes("minipc") || n === "mini pc") {
    return {
      good: [/\bpc\b|laptop|nettbrett|tablet\s*pc|mini\s*pc|desktop/],
      bad: [/controller|gamepad|mus\b|mouse|tastatur|keyboard/],
      allowEmpty: n === "gaming pc",
    };
  }
  if (n.includes("laptop") || n === "baerbar" || n === "bærbar") {
    return {
      good: [/laptop|notebook|baerbar|nettbrett|tablet/],
      bad: [/stativ|cooler|mus\b|mouse|tastatur|gamepad/],
      allowEmpty: true,
    };
  }
  if (
    n.includes("ladekabel") ||
    n.includes("usb c kabel") ||
    (n.includes("kabel") && n.includes("usb"))
  ) {
    return {
      good: [/kabel|cable|usb/],
      bad: [/holder|organizer|bag|musematte/],
      allowEmpty: true,
    };
  }
  if (
    n.includes("usb") ||
    n === "hub" ||
    n.includes("dokking") ||
    n.includes("adapter")
  ) {
    return {
      good: [/usb|hub|dock|dokking|adapter/],
    };
  }
  if (
    n.includes("lader") ||
    n.includes("charger") ||
    n.includes("powerbank") ||
    n.includes("nodlader") ||
    n.includes("nødlader") ||
    n.includes("qi") ||
    n.includes("magsafe") ||
    n.includes("oplader") ||
    n.includes("batteri")
  ) {
    return {
      good: [/lader|charger|powerbank|qi|magsafe|batteri|tradlos/],
      bad: [/musematte|tastatur|datamus/],
    };
  }
  if (
    n.includes("headset") ||
    n.includes("hodetelefon") ||
    n.includes("earbuds") ||
    n.includes("oreprop") ||
    n.includes("øreprop") ||
    n.includes("airpods")
  ) {
    return {
      good: [/headset|hodetelefon|earbuds|oreprop|airpods|tws/],
      bad: [/tastatur og mus|musematte/],
      allowEmpty: n.includes("airpods"),
    };
  }
  if (n.includes("hoyttaler") || n.includes("høyttaler") || n.includes("soundbar") || n.includes("speaker")) {
    return {
      good: [/hoyttaler|høyttaler|speaker|soundbar/],
    };
  }
  if (n.includes("mikrofon") || n.includes("microphone")) {
    return {
      good: [/mikrofon|microphone|\bmic\b/],
      bad: [/^mikrofonstativ/],
    };
  }
  if (n.includes("kontroller") || n.includes("gamepad") || n.includes("spillkontroller")) {
    return {
      good: [/kontroller|gamepad|controller|spillkontroller/],
    };
  }
  if (n.includes("projektor")) {
    return { good: [/projektor|projector/], allowEmpty: true };
  }
  if (n === "skjerm" || n === "monitor") {
    return { good: [/skjerm|monitor|display/], allowEmpty: true };
  }
  if (n === "tv" || n.includes("tv feste")) {
    return { good: [/\btv\b|fjernsyn|feste/], allowEmpty: true };
  }
  if (
    n.includes("airfryer") ||
    n.includes("stovsuger") ||
    n.includes("støvsuger") ||
    n.includes("kaffemaskin") ||
    n.includes("robot") ||
    n.includes("smartklokke") ||
    n.includes("smartwatch")
  ) {
    return {
      good: [/airfryer|stovsuger|støvsuger|kaffe|robot|klokke|watch|fryer/],
      allowEmpty: true,
    };
  }
  if (n.includes("webkamera") || n.includes("webcam")) {
    return { good: [/webkamera|webcam/] };
  }
  if (n.includes("led") || n.includes("lampe")) {
    return { good: [/led|lampe|lys|strip|list/] };
  }
  if (n.includes("nettbrett") || n === "tablet") {
    return { good: [/nettbrett|tablet|ipad/] };
  }
  if (n.includes("wifi") || n.includes("ruter")) {
    return { good: [/wifi|wi.?fi|ruter|router|adapter|nettverk/] };
  }
  if (n.includes("skjermbeskytter") || n.includes("herdet glass")) {
    return { good: [/skjermbeskytter|herdet|glass|protector/], allowEmpty: true };
  }
  if (n.includes("holder") || n === "stativ") {
    return { good: [/holder|stativ|stand|mount/] };
  }
  // default: token overlap
  const tokens = n.split(" ").filter((t) => t.length > 2);
  return {
    good: tokens.length ? [new RegExp(tokens.map(escapeRe).join("|"), "i")] : [/.*/],
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGood(name: string, expect: Expect): boolean {
  const n = norm(name);
  return expect.good.some((re) => re.test(n) || re.test(name));
}

function isBad(name: string, expect: Expect): boolean {
  if (!expect.bad) return false;
  return expect.bad.some((re) => re.test(norm(name)) || re.test(name));
}

type Verdict = "PASS" | "WEAK" | "FAIL" | "EMPTY_OK" | "EMPTY_GAP";

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

  const searchable = products.map((p) => ({
    ...p,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
  }));

  const uniqueQueries = [...new Set(QUERIES.map((q) => q.trim()).filter(Boolean))];
  const rows: unknown[] = [];

  let pass = 0;
  let weak = 0;
  let fail = 0;
  let emptyOk = 0;
  let emptyGap = 0;

  for (const q of uniqueQueries) {
    const expect = expectations(q);
    const parsed = parseSearchQuery(q);
    const ranked = filterByMinRelevance(rankProductsForSearch(searchable, q));
    const top5 = ranked.slice(0, 5);
    const top1 = top5[0] || null;

    const top1Good = top1 ? isGood(top1.name, expect) && !isBad(top1.name, expect) : false;
    const top5GoodCount = top5.filter((p) => isGood(p.name, expect) && !isBad(p.name, expect)).length;
    const falsePositives = top5.filter((p) => isBad(p.name, expect) || (!isGood(p.name, expect) && ranked.length > 0));
    // stricter FP: only explicit bad OR clearly off when we have good patterns
    const strictFp = top5.filter((p) => isBad(p.name, expect));
    const softFp = top5.filter((p) => !isGood(p.name, expect) && !isBad(p.name, expect));

    // Missing: catalog has strong name matches not in results?
    const catalogStrong = searchable.filter((p) => isGood(p.name, expect) && !isBad(p.name, expect));
    const returnedIds = new Set(ranked.map((p) => p.id));
    const missingStrong = catalogStrong.filter((p) => !returnedIds.has(p.id)).slice(0, 5);

    let verdict: Verdict;
    let notes = "";

    if (ranked.length === 0) {
      if (catalogStrong.length === 0 && expect.allowEmpty) {
        verdict = "EMPTY_OK";
        notes = "Ingen relevante produkter i katalog (forventet sortimentshull)";
        emptyOk++;
      } else if (catalogStrong.length === 0) {
        verdict = "EMPTY_GAP";
        notes = "0 treff og 0 åpenbare produkter i katalog";
        emptyGap++;
      } else {
        verdict = "FAIL";
        notes = `0 treff men ${catalogStrong.length} åpenbare i katalog`;
        fail++;
      }
    } else if (top1Good && top5GoodCount >= Math.min(3, top5.length) && strictFp.length === 0) {
      verdict = "PASS";
      notes = "Topp1 OK, topp5 stort sett relevante";
      pass++;
    } else if (top1Good && strictFp.length === 0) {
      verdict = "WEAK";
      notes = `Topp1 OK men kun ${top5GoodCount}/5 tydelig relevante`;
      weak++;
    } else if (!top1Good || strictFp.length > 0) {
      verdict = "FAIL";
      notes = [
        !top1Good ? "Topp1 ikke relevant" : "",
        strictFp.length ? `${strictFp.length} klare FP i topp5` : "",
      ]
        .filter(Boolean)
        .join("; ");
      fail++;
    } else {
      verdict = "WEAK";
      notes = "Blandet relevans";
      weak++;
    }

    rows.push({
      query: q,
      intent: parsed?.intent ?? null,
      tokens: parsed?.tokens ?? [],
      hitCount: ranked.length,
      catalogStrongCount: catalogStrong.length,
      top1: top1
        ? { name: top1.name, category: top1.category, subcategory: top1.subcategory, score: top1.searchScore }
        : null,
      top1Good,
      top5: top5.map((p) => ({
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        score: p.searchScore,
        good: isGood(p.name, expect),
        bad: isBad(p.name, expect),
      })),
      top5GoodCount,
      strictFalsePositives: strictFp.map((p) => p.name),
      softOffTopic: softFp.map((p) => p.name),
      missingStrongSamples: missingStrong.map((p) => p.name),
      verdict,
      notes,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    catalogSize: searchable.length,
    queryCount: uniqueQueries.length,
    pass,
    weak,
    fail,
    emptyOk,
    emptyGap,
    passRate: Math.round((pass / uniqueQueries.length) * 1000) / 10,
    usableRate:
      Math.round(((pass + weak + emptyOk) / uniqueQueries.length) * 1000) / 10,
  };

  const fails = rows.filter((r: { verdict: string }) => r.verdict === "FAIL");
  const weaks = rows.filter((r: { verdict: string }) => r.verdict === "WEAK");
  const gaps = rows.filter((r: { verdict: string }) => r.verdict === "EMPTY_GAP");

  const out = { summary, fails, weaks, gaps, all: rows };
  fs.writeFileSync("scripts/.qa-search-report.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("FAILS", fails.length);
  for (const f of fails.slice(0, 25) as Array<{ query: string; notes: string; top1: { name: string } | null }>) {
    console.log(`  FAIL ${f.query} — ${f.notes} — top1=${f.top1?.name || "(none)"}`);
  }
  console.log("WROTE scripts/.qa-search-report.json");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
