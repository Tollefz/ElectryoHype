/**
 * Append unique Temu product URLs to data/bulk-import-urls.txt.
 * No browser automation — used by the agent after Cursor browser MCP extracts URLs.
 *
 * Usage:
 *   npx tsx scripts/append-temu-urls.ts <url> [url...]
 *   npx tsx scripts/append-temu-urls.ts --stdin   # one URL per line
 *   npx tsx scripts/append-temu-urls.ts --count
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

const OUTPUT_FILE = join(process.cwd(), "data", "bulk-import-urls.txt");
const TARGET = 500;

function ensureFile(): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(OUTPUT_FILE)) appendFileSync(OUTPUT_FILE, "", "utf8");
}

function loadKnown(): Set<string> {
  ensureFile();
  return new Set(
    readFileSync(OUTPUT_FILE, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );
}

function isProductUrl(raw: string): string | null {
  try {
    let href = raw.trim();
    if (!href) return null;
    if (href.startsWith("//")) href = `https:${href}`;
    if (href.startsWith("/")) href = `https://www.temu.com${href}`;
    const u = new URL(href);
    if (!u.hostname.replace(/^www\./, "").endsWith("temu.com")) return null;
    const path = u.pathname.toLowerCase();
    if (
      path.includes("search_result") ||
      path.includes("bgn_verification") ||
      path.includes("/login") ||
      path.includes("/cart") ||
      path.includes("/channel/") ||
      path.includes("/category") ||
      path.includes("campaign") ||
      path.includes("activity") ||
      path.includes("lightning-deals")
    ) {
      return null;
    }
    const m = u.pathname.match(/-g-(\d{8,})(?:\.html)?/i);
    const q = u.searchParams.get("goods_id") || u.searchParams.get("goodsId");
    if (!m && !q) return null;
    const decoded = decodeURIComponent(u.pathname.split("?")[0].split("#")[0]);
    const localePath = decoded.startsWith("/no/")
      ? decoded
      : decoded.startsWith("/")
        ? `/no${decoded}`
        : `/no/${decoded}`;
    const withHtml = localePath.endsWith(".html") ? localePath : `${localePath}.html`;
    return `https://www.temu.com${withHtml}`;
  } catch {
    return null;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const known = loadKnown();

  if (args[0] === "--count") {
    console.log(`count=${known.size} target=${TARGET} remaining=${Math.max(0, TARGET - known.size)}`);
    return;
  }

  let candidates: string[] = [];
  if (args[0] === "--stdin") {
    candidates = readFileSync(0, "utf8").split(/\r?\n/);
  } else {
    candidates = args;
  }

  let added = 0;
  for (const raw of candidates) {
    const canon = isProductUrl(raw);
    if (!canon || known.has(canon)) continue;
    appendFileSync(OUTPUT_FILE, `${canon}\n`, "utf8");
    known.add(canon);
    added += 1;
  }

  console.log(`added=${added} total=${known.size}`);
  if (known.size > 0 && known.size % 25 === 0) {
    console.log(`Collected: ${known.size} URLs`);
  }
  if (known.size >= TARGET) {
    console.log(`TARGET_REACHED ${TARGET}`);
  }
}

main();
