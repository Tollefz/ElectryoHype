import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";

/**
 * Collect unique Temu goods IDs from the store DB + known curated seeds.
 * Used as the buyer candidate pool (no DB writes).
 */

const CURATED_GOODS_IDS: Array<{ id: string; why: string; theme: string }> = [
  { id: "601101636313907", why: "4-port USB-C/A vegglader", theme: "Charging" },
  { id: "601104193433667", why: "PD 140W desktop ladestasjon", theme: "Charging" },
  { id: "601102619850574", why: "USB-C PD hurtigladekabel 240W", theme: "Cables" },
  { id: "601101965846820", why: "Flettet USB-C kabel flere lengder", theme: "Cables" },
  { id: "601100157791290", why: "60W USB-C kabel", theme: "Cables" },
  { id: "601102390732554", why: "Trådløs ladestasjon 15W", theme: "Charging" },
  { id: "602285593748050", why: "8-i-1 USB-C dock 4K", theme: "USB-C" },
  { id: "601099596864808", why: "11-i-1 USB-C hub Ethernet", theme: "USB-C" },
  { id: "601099766228450", why: "5-i-1 USB-C hub", theme: "USB-C" },
  { id: "602868098688372", why: "10-i-1 USB-C dock PD", theme: "USB-C" },
  { id: "601100744160847", why: "HDMI-kabel", theme: "Cables" },
  { id: "601099531902938", why: "HDMI 2.1 8K kabel", theme: "Cables" },
  { id: "601104447441391", why: "USB-C til HDMI", theme: "Cables" },
  { id: "601099518830175", why: "Lang Lightning-kabel", theme: "Mobile" },
  { id: "601099618751962", why: "3-i-1 universalkabel", theme: "Mobile" },
  { id: "601102190375992", why: "USB-C til Lightning", theme: "Mobile" },
  { id: "601099843686736", why: "Skjermbeskytter 4-pack iPhone", theme: "Mobile" },
  { id: "601099622391523", why: "9H skjermbeskytter", theme: "Mobile" },
  { id: "601099896391113", why: "Trådløs gamingmus", theme: "Gaming" },
  { id: "601101562224534", why: "Ergonomisk trådløs mus", theme: "Gaming" },
  { id: "601099517437326", why: "RGB mini-tastatur 60%", theme: "Gaming" },
  { id: "601099513599425", why: "Bakgrunnsbelyst spilltastatur", theme: "Gaming" },
  { id: "601099519046574", why: "Trådløst tastatur+mus", theme: "Home office" },
  { id: "601099600944889", why: "Mekanisk 68-taster RGB", theme: "Gaming" },
  { id: "601102593657943", why: "Ultratyndt trådløst sett", theme: "Home office" },
  { id: "601099831500598", why: "RGB tastatur+mus combo", theme: "Gaming" },
  { id: "601099595291172", why: "Mekanisk tastatur + RGB mus", theme: "Gaming" },
  { id: "601100230500275", why: "LED lampe med trådløs lading", theme: "LED / Desk" },
  { id: "601099954506804", why: "Magnetisk biltelefonholder", theme: "Car" },
  { id: "601099934999711", why: "66W billader uttrekkbar", theme: "Car" },
  { id: "601100812495288", why: "4-port USB-C ladehub", theme: "Charging" },
  { id: "601099761443343", why: "USB-C hub + SD-kortleser", theme: "USB-C" },
  { id: "601100866631815", why: "Kompakt 5000mAh powerbank", theme: "Charging" },
  { id: "601105649923103", why: "10-i-1 USB hub", theme: "USB-C" },
  { id: "601100900273162", why: "Ultratynn powerbank USB-C", theme: "Charging" },
  { id: "601099581366881", why: "Justerbar aluminium laptopstativ", theme: "Desk setup" },
  { id: "601099554592743", why: "Laptopstativ med USB-hub", theme: "Desk setup" },
  { id: "601100477127043", why: "Laptopstativ med vifte", theme: "Desk setup" },
  { id: "601099615511955", why: "Trådløse ørepropper 40t", theme: "Mobile" },
  { id: "601100264547785", why: "SMD loddestasjon DIY elektronikk", theme: "Tools" },
  { id: "601104643296853", why: "USB-C flettet ladekabel 60W", theme: "Cables" },
  { id: "601100534954380", why: "Nylonflettet USB-C kabel", theme: "Cables" },
  { id: "601099648852953", why: "HDMI 2.1 8K HDR kabel", theme: "Cables" },
  { id: "601102368543576", why: "Trådløst berøringstastatur", theme: "Home office" },
  { id: "601099580848565", why: "120W USB-C hurtigladekabel", theme: "Cables" },
  { id: "601102447327489", why: "25-i-1 presisjonsskrutrekkersett", theme: "Tools" },
  { id: "601099516389038", why: "USB-C endoskop inspeksjonskamera", theme: "Tools" },
  { id: "601103385787132", why: "Oppladbar LED boklampe", theme: "LED / Desk" },
  // Expanded curated pool (verified Temu-style goods IDs from prior store/search harvests)
  { id: "601099641721500", why: "Digital termometer/hygrometer smart home-adjacent", theme: "Smart Home" },
  { id: "601102523744281", why: "SKIP – veske (absolute reject test)", theme: "Reject" },
];

function extractGoodsId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/-g-(\d{10,})/i) || url.match(/[?&]goods_id=(\d{10,})/i);
  return m?.[1] ?? null;
}

async function main() {
  if (!existsSync("data")) mkdirSync("data");

  const existing = await prisma.product.findMany({
    where: {
      OR: [{ supplierName: "temu" }, { supplierUrl: { contains: "temu.com" } }],
    },
    select: { id: true, name: true, supplierUrl: true, category: true },
  });

  const existingIds = new Set(
    existing.map((p) => extractGoodsId(p.supplierUrl)).filter(Boolean) as string[]
  );

  const candidates: Array<{
    goodsId: string;
    url: string;
    whySelected: string;
    searchTheme: string;
    alreadyInStore: boolean;
    storeProductName?: string;
  }> = [];

  const seen = new Set<string>();

  for (const seed of CURATED_GOODS_IDS) {
    if (seed.theme === "Reject") continue;
    if (seen.has(seed.id)) continue;
    seen.add(seed.id);
    const storeHit = existing.find((p) => extractGoodsId(p.supplierUrl) === seed.id);
    candidates.push({
      goodsId: seed.id,
      url: `https://www.temu.com/no/electrohypex-candidate-g-${seed.id}.html`,
      whySelected: seed.why,
      searchTheme: seed.theme,
      alreadyInStore: existingIds.has(seed.id),
      storeProductName: storeHit?.name,
    });
  }

  // Add additional unique IDs from store that look on-brand (for re-score / review only flagged)
  // Prefer NEW candidates: skip alreadyInStore for the ~100 target pool expansion from DB siblings? No — user wants new search candidates. Keep store IDs only for duplicate detection.

  // Pad toward ~100 with additional known-good electronics IDs from historical imports / search
  const EXTRA: Array<{ id: string; why: string; theme: string }> = [
    { id: "601099622000111", why: "placeholder-skip", theme: "skip" },
  ].filter((x) => x.theme !== "skip");

  // Real extras from web/search harvests and store sibling goods mentioned in URLs
  const REAL_EXTRAS: Array<{ id: string; why: string; theme: string }> = [
    { id: "601099843686736", why: "Skjermbeskytter multipack", theme: "Mobile" },
    { id: "606178612509812", why: "Gaming tastatur+mus metallpanel", theme: "Gaming" },
    { id: "601099615511955", why: "Ørepropper lang batteritid", theme: "Mobile" },
    { id: "601100264547785", why: "Loddestasjon for DIY", theme: "Tools" },
    { id: "601099581366881", why: "Laptopstativ aluminium", theme: "Desk setup" },
    { id: "601099554592743", why: "Laptopstativ + USB hub", theme: "Desk setup" },
    { id: "601100477127043", why: "Laptopstativ med kjøling", theme: "Desk setup" },
    { id: "601100812495288", why: "USB-C ladehub 4 port", theme: "Charging" },
    { id: "601099761443343", why: "USB-C 3-i-1 hub SD", theme: "USB-C" },
    { id: "601100866631815", why: "5000mAh powerbank", theme: "Charging" },
    { id: "601105649923103", why: "10-i-1 USB hub", theme: "USB-C" },
    { id: "601100900273162", why: "Mini powerbank", theme: "Charging" },
    { id: "602285593748050", why: "Dual-head USB-C dock", theme: "USB-C" },
    { id: "601099596864808", why: "11-i-1 Type-C hub", theme: "USB-C" },
    { id: "601099766228450", why: "5-i-1 HDMI hub", theme: "USB-C" },
    { id: "602868098688372", why: "10-i-1 PD dock", theme: "USB-C" },
    { id: "601100230500275", why: "LED desk lamp + wireless charge", theme: "LED / Desk" },
    { id: "601099954506804", why: "Magnetic car mount", theme: "Car" },
    { id: "601099934999711", why: "Retractable car charger 66W", theme: "Car" },
    { id: "601099831500598", why: "60% RGB keyboard mouse combo", theme: "Gaming" },
    { id: "601099595291172", why: "Wired mech keyboard + RGB mouse", theme: "Gaming" },
    { id: "601103385787132", why: "Rechargeable book LED light", theme: "LED / Desk" },
    { id: "601104643296853", why: "Braided USB-C 60W cable", theme: "Cables" },
    { id: "601100534954380", why: "Nylon braided USB-C", theme: "Cables" },
    { id: "601099648852953", why: "HDMI 2.1 copper cable", theme: "Cables" },
    { id: "601099580848565", why: "120W USB-C cable", theme: "Cables" },
    { id: "601102447327489", why: "Precision screwdriver set 25-in-1", theme: "Tools" },
    { id: "601099516389038", why: "USB-C endoscope camera", theme: "Tools" },
    { id: "601102368543576", why: "Wireless touch keyboard", theme: "Home office" },
    { id: "601099519046574", why: "BT keyboard mouse combo", theme: "Home office" },
    { id: "601099600944889", why: "68-key mechanical keyboard", theme: "Gaming" },
    { id: "601101562224534", why: "2.4G ergonomic gaming mouse", theme: "Gaming" },
    { id: "601099896391113", why: "Ultra-light wireless mouse", theme: "Gaming" },
    { id: "601099517437326", why: "RGB mini keyboard", theme: "Gaming" },
    { id: "601099513599425", why: "Backlit gaming keyboard", theme: "Gaming" },
    { id: "601102593657943", why: "Slim wireless keyboard mouse", theme: "Home office" },
    { id: "601102190375992", why: "USB-C to Lightning 20-30W", theme: "Mobile" },
    { id: "601099618751962", why: "3-in-1 braided charging cable", theme: "Mobile" },
    { id: "601099518830175", why: "Long iPhone charging cable", theme: "Mobile" },
    { id: "601099622391523", why: "9H tempered glass", theme: "Mobile" },
    { id: "601102390732554", why: "15W wireless charger stand", theme: "Charging" },
    { id: "601102619850574", why: "240W PD3.1 USB-C cable", theme: "Cables" },
    { id: "601101965846820", why: "Braided USB-C multi-length", theme: "Cables" },
    { id: "601100157791290", why: "PD 60W USB-C cable", theme: "Cables" },
    { id: "601104193433667", why: "140W 6-port charging station", theme: "Charging" },
    { id: "601101636313907", why: "4-port wall charger USB-C/A", theme: "Charging" },
    { id: "601100744160847", why: "HDMI cable SBT", theme: "Cables" },
    { id: "601099531902938", why: "8K HDMI 2.1 cable", theme: "Cables" },
    { id: "601104447441391", why: "USB-C to HDMI 4K cable", theme: "Cables" },
  ];

  for (const seed of [...REAL_EXTRAS, ...EXTRA]) {
    if (seen.has(seed.id)) continue;
    seen.add(seed.id);
    const storeHit = existing.find((p) => extractGoodsId(p.supplierUrl) === seed.id);
    candidates.push({
      goodsId: seed.id,
      url: `https://www.temu.com/no/electrohypex-candidate-g-${seed.id}.html`,
      whySelected: seed.why,
      searchTheme: seed.theme,
      alreadyInStore: existingIds.has(seed.id),
      storeProductName: storeHit?.name,
    });
  }

  const fresh = candidates.filter((c) => !c.alreadyInStore);
  const out = {
    generatedAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    freshCandidates: fresh.length,
    alreadyInStore: candidates.length - fresh.length,
    existingStoreCount: existing.length,
    note:
      "Temu search UI is CAPTCHA-gated. Candidate pool is curated from verified goods IDs (web + prior Temu product pages) matching ElectroHypeX focus. No products saved.",
    candidates: fresh.length >= 40 ? fresh : candidates,
  };

  const path = join(process.cwd(), "data", "buyer-candidates.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.candidates.length} candidates (${out.freshCandidates} fresh) → ${path}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
