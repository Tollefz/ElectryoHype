import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import { cleanProductName } from "@/lib/utils/url-decode";

/**
 * Prefer a Norwegian store title for customers.
 * metaTitle often holds the AI/Norwegian name while `name` is still supplier English.
 */
export function storefrontProductTitle(input: {
  name: string;
  metaTitle?: string | null;
}): string {
  const cleaned = cleanProductName(input.name || "");
  const meta = (input.metaTitle || "")
    .replace(/\s*[|–-]\s*ElectroHypeX.*$/i, "")
    .trim();

  if (
    meta.length >= 8 &&
    looksLikeEnglishTitle(cleaned) &&
    !looksLikeEnglishTitle(meta)
  ) {
    return cleanProductName(meta);
  }

  return cleaned;
}
