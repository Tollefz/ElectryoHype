/**
 * Title fingerprint for multi-supplier grouping.
 */

export function productFingerprint(title: string): string {
  const tokens = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\wæøå\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .slice(0, 7);
  return tokens.join("|") || title.toLowerCase().slice(0, 40);
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "usb",
  "type",
  "new",
  "pro",
  "set",
  "pack",
  "pcs",
  "pc",
]);
