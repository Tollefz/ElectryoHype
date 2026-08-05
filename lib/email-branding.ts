import { SITE_CONFIG } from "@/lib/site";

/** Content-ID for inline ElectroHypeX logo (Resend CID). Shared — no Node APIs. */
export const EMAIL_LOGO_CID = "ehx-logo";

const PLACEHOLDER_NAME =
  /^(test|testprodukt|test product|placeholder|lorem|asdf|demo|ukjent produkt|unknown product|produkt)$/i;

/**
 * True when a title is clearly a placeholder / test SKU, not a retail name.
 */
export function isPlaceholderProductName(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (PLACEHOLDER_NAME.test(n)) return true;
  if (n.includes("testprodukt") || n.includes("lorem ipsum")) return true;
  return false;
}

/**
 * Soften AI / Temu-style titles into something a Norwegian retailer would show.
 * Display-only — does not mutate the database.
 */
export function humanizeProductTitle(input: string): string {
  let s = String(input || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!s || isPlaceholderProductName(s)) return "Produkt";

  s = s.replace(/^(stk\.?\s*fra\s+|stk\.?\s+|nytt\s+|bestseller\s+|original\s+)/i, "");

  s = s
    .replace(/\busb\s*-?\s*c\b/gi, "USB-C")
    .replace(/\busb\s*-?\s*a\b/gi, "USB-A")
    .replace(/\btws\b/gi, "TWS")
    .replace(/\bled\b/gi, "LED")
    .replace(/\bhdmi\b/gi, "HDMI")
    .replace(/\brgb\b/gi, "RGB")
    .replace(/\bpd\b/gi, "PD")
    .replace(/\bqc\b/gi, "QC");

  const small = new Set(["og", "i", "til", "for", "med", "av", "på", "fra", "a", "an", "the"]);
  const keep = /^(USB-C|USB-A|TWS|LED|HDMI|RGB|PD|QC)$/;

  s = s
    .split(" ")
    .map((word, index) => {
      if (keep.test(word)) return word;
      if (/^[A-Z0-9]{2,}(-[A-Z0-9]+)*$/.test(word) && word === word.toUpperCase()) return word;
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      if (lower.length <= 1) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");

  s = s
    .replace(/\b(Overflateadsorpsjon|Bassforsterkning|Lydresonansguide)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (s.length > 64) {
    const cut = s.slice(0, 64);
    const lastSpace = cut.lastIndexOf(" ");
    s = `${(lastSpace > 36 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  return s || "Produkt";
}

/** Prefer CID in real sends; fall back to absolute public URL. */
export function resolveEmailLogoSrc(preferCid = true): string {
  if (preferCid) return `cid:${EMAIL_LOGO_CID}`;
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    SITE_CONFIG.siteUrl ||
    "https://www.electrohypex.com"
  ).replace(/\/$/, "");
  return `${base}/email-logo.png`;
}
