/**
 * Token helpers for Store Identity — multi-signal overlap, not brand word lists.
 */

const STOP = new Set([
  "og",
  "eller",
  "med",
  "for",
  "til",
  "fra",
  "the",
  "and",
  "or",
  "with",
  "for",
  "a",
  "an",
  "av",
  "en",
  "et",
  "de",
  "den",
  "det",
  "på",
  "i",
  "som",
  "uten",
  "ikke",
  "no",
  "name",
  "bulk",
  "pcs",
  "set",
  "kit",
  "pro",
  "plus",
  "max",
  "mini",
  "new",
  "usb",
  "led",
]);

export function normalizeIdentityText(raw: string | null | undefined): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9\s&/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract meaningful tokens (≥3 chars, not stopwords). */
export function tokenizeIdentity(raw: string | null | undefined): string[] {
  const text = normalizeIdentityText(raw);
  if (!text) return [];
  const out: string[] = [];
  for (const part of text.split(/[\s&/+-]+/)) {
    if (part.length < 3) continue;
    if (STOP.has(part)) continue;
    if (/^\d+$/.test(part)) continue;
    out.push(part);
  }
  return out;
}

export function tokenSet(parts: Array<string | null | undefined>): Set<string> {
  const s = new Set<string>();
  for (const p of parts) {
    for (const t of tokenizeIdentity(p)) s.add(t);
  }
  return s;
}

/** Jaccard-ish overlap 0–1 between product tokens and identity anchors. */
export function tokenOverlapRatio(
  productTokens: Set<string>,
  identityTokens: Set<string>
): number {
  if (productTokens.size === 0 || identityTokens.size === 0) return 0;
  let hit = 0;
  for (const t of productTokens) {
    if (identityTokens.has(t)) hit += 1;
  }
  if (hit === 0) {
    // partial prefix/contains for compound tokens (hub ↔ usbhub)
    for (const p of productTokens) {
      for (const i of identityTokens) {
        if (p.length >= 4 && i.length >= 4 && (p.includes(i) || i.includes(p))) {
          hit += 0.5;
          break;
        }
      }
    }
  }
  const denom = Math.min(8, Math.max(productTokens.size, 3));
  return Math.min(1, hit / denom);
}

export function tagsToList(tags: string[] | string | null | undefined): string[] {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  if (typeof tags === "string" && tags.trim()) {
    try {
      const p = JSON.parse(tags);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      return tags.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}
