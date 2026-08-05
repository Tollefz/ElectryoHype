/**
 * Sort product media: hero → detail → lifestyle → packaging → other; videos last.
 */

export type SortableImage = { url: string; kind?: string | null };

const KIND_ORDER: Record<string, number> = {
  hero: 0,
  main: 0,
  primary: 0,
  detail: 1,
  closeup: 1,
  lifestyle: 2,
  environment: 2,
  ambient: 2,
  scene: 2,
  packaging: 3,
  package: 3,
  box: 3,
  other: 4,
};

function guessKindFromUrl(url: string, index: number): number {
  const u = url.toLowerCase();
  if (index === 0) return 0;
  if (/pack|box|carton|emballasje/.test(u)) return 3;
  if (/lifestyle|scene|room|desk|setup|in.?use/.test(u)) return 2;
  if (/detail|close|macro|zoom/.test(u)) return 1;
  return index === 1 ? 1 : 4;
}

export function sortProductImageUrls(urls: string[]): string[] {
  const scored = urls
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .map((url, index) => ({
      url,
      score: guessKindFromUrl(url, index),
      index,
    }));
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scored) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s.url);
  }
  return out;
}

/** Keep only playable http(s) video URLs. */
export function filterPlayableVideoUrls(
  videos: Array<{ url?: string | null; videoUrl?: string | null } | string>
): string[] {
  const out: string[] = [];
  for (const v of videos) {
    const url =
      typeof v === "string"
        ? v
        : typeof v?.url === "string"
          ? v.url
          : typeof v?.videoUrl === "string"
            ? v.videoUrl
            : "";
    if (url.startsWith("http://") || url.startsWith("https://")) {
      if (!out.includes(url)) out.push(url);
    }
  }
  return out;
}
