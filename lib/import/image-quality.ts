/**
 * Image quality helpers for imported product images.
 *
 * Upgrades known thumbnail URL patterns to full resolution.
 * Only removes INVALID images. Valid supplier images are never dropped
 * just because they look like thumbnails.
 */

export type ImageFilterReason =
  | "kept"
  | "empty"
  | "unsupported"
  | "invalid"
  | "duplicate";

export type ImagePrepareEntry = {
  originalUrl: string;
  finalUrl: string | null;
  reason: ImageFilterReason;
  /** Present when reason === duplicate */
  duplicateOf?: string;
  /** Heuristic note only — never used to drop a valid image */
  notes?: string[];
};

export type PrepareImagesResult = {
  images: string[];
  report: ImagePrepareEntry[];
  dropped: ImagePrepareEntry[];
};

/** Size suffixes like "_100x100" or "-350x350" before the file extension. */
const SIZE_SUFFIX_PATTERN = /[_-]\d{2,4}x\d{2,4}(?=\.(?:jpg|jpeg|png|webp|gif)(?:$|\?))/i;

/** URL segments that indicate an intentionally small thumbnail. */
const THUMBNAIL_HINTS = /\/(thumb|thumbnail|small|tiny|icon)s?\//i;

const SUPPORTED_EXT = /\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:$|\?)/i;

/**
 * Upgrade a single image URL to its best available resolution:
 * - strips CDN resize query params (?imageView2/..., ?w=100 etc.)
 * - removes explicit size suffixes from the filename
 */
export function upgradeImageUrl(url: string): string {
  if (!url || !url.startsWith("http")) return url;

  let upgraded = url.split("?")[0];
  upgraded = upgraded.replace(SIZE_SUFFIX_PATTERN, "");
  return upgraded;
}

/** Heuristic only — does not decide keep/drop. */
export function looksLikeThumbnail(url: string): boolean {
  if (THUMBNAIL_HINTS.test(url)) return true;
  const sizeMatch = url.match(/[_-](\d{2,4})x(\d{2,4})(?=\.(?:jpg|jpeg|png|webp|gif))/i);
  if (sizeMatch) {
    const width = parseInt(sizeMatch[1], 10);
    const height = parseInt(sizeMatch[2], 10);
    return Math.max(width, height) < 400;
  }
  return false;
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Prepare supplier image list for import.
 * Only invalid / empty / unsupported / exact-duplicate (after upgrade) are removed.
 */
export function prepareImagesDetailed(urls: string[]): PrepareImagesResult {
  const report: ImagePrepareEntry[] = [];
  const images: string[] = [];
  const seen = new Map<string, string>(); // finalUrl -> first original

  for (const raw of urls) {
    const originalUrl = typeof raw === "string" ? raw.trim() : "";
    const notes: string[] = [];

    if (!originalUrl) {
      report.push({ originalUrl: String(raw ?? ""), finalUrl: null, reason: "empty" });
      continue;
    }

    if (!originalUrl.startsWith("http")) {
      report.push({
        originalUrl,
        finalUrl: null,
        reason: "unsupported",
        notes: ["does not start with http(s)"],
      });
      continue;
    }

    if (!isValidHttpUrl(originalUrl)) {
      report.push({ originalUrl, finalUrl: null, reason: "invalid", notes: ["URL parse failed"] });
      continue;
    }

    const finalUrl = upgradeImageUrl(originalUrl);
    if (!isValidHttpUrl(finalUrl)) {
      report.push({
        originalUrl,
        finalUrl: null,
        reason: "invalid",
        notes: ["upgrade produced invalid URL"],
      });
      continue;
    }

    if (!SUPPORTED_EXT.test(finalUrl) && !SUPPORTED_EXT.test(originalUrl)) {
      // Still keep CDN URLs without extension (CJ often serves extension-less or .jpg)
      // Only mark unsupported when clearly not an image scheme — keep http images without ext.
      notes.push("no image extension detected (kept)");
    }

    if (looksLikeThumbnail(originalUrl) || looksLikeThumbnail(finalUrl)) {
      notes.push("thumbnail heuristic matched (kept — valid image)");
    }

    if (seen.has(finalUrl)) {
      report.push({
        originalUrl,
        finalUrl,
        reason: "duplicate",
        duplicateOf: seen.get(finalUrl),
        notes,
      });
      continue;
    }

    seen.set(finalUrl, originalUrl);
    images.push(finalUrl);
    report.push({
      originalUrl,
      finalUrl,
      reason: "kept",
      notes: notes.length ? notes : undefined,
    });
  }

  return {
    images,
    report,
    dropped: report.filter((r) => r.reason !== "kept"),
  };
}

/**
 * Back-compat wrapper — returns only kept image URLs.
 */
export function prepareImages(urls: string[]): string[] {
  return prepareImagesDetailed(urls).images;
}

export function logImagePrepareReport(
  report: ImagePrepareEntry[],
  log: (msg: string, meta?: Record<string, unknown>) => void = console.info
): void {
  for (const entry of report) {
    if (entry.reason === "kept") continue;
    log("[import:images:filtered]", {
      url: entry.originalUrl,
      reason: entry.reason,
      duplicateOf: entry.duplicateOf ?? null,
      finalUrl: entry.finalUrl,
      notes: entry.notes ?? [],
    });
  }
}
