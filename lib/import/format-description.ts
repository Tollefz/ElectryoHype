import type { AIEnrichmentResult } from "@/lib/import/types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface FormatDescriptionOptions {
  /** Delivery estimate shown in the "Levering" section. */
  deliveryTime?: string;
  /** Include the standard delivery and warranty sections (default true). */
  includeDeliveryAndWarranty?: boolean;
}

const DEFAULT_DELIVERY_TIME = "5–12 virkedager";

/**
 * Build storefront-ready HTML description from structured AI output.
 *
 * Structure: introduction, key features, benefits, technical
 * specifications, package contents, delivery and warranty.
 */
export function formatProductDescription(
  enrichment: Pick<
    AIEnrichmentResult,
    "shortIntroduction" | "benefits" | "specifications" | "packageContents"
  > & { highlightedFeatures?: string[] },
  options: FormatDescriptionOptions = {}
): string {
  const parts: string[] = [];

  if (enrichment.shortIntroduction.trim()) {
    parts.push(`<p>${escapeHtml(enrichment.shortIntroduction.trim())}</p>`);
  }

  const highlights = enrichment.highlightedFeatures?.filter((feature) => feature.trim()) ?? [];
  if (highlights.length > 0) {
    parts.push("<h3>Viktige egenskaper</h3>");
    parts.push(
      "<ul>" +
        highlights
          .map((feature) => `<li><strong>${escapeHtml(feature.trim())}</strong></li>`)
          .join("") +
        "</ul>"
    );
  }

  if (enrichment.benefits.length > 0) {
    parts.push("<h3>Fordeler</h3>");
    parts.push(
      "<ul>" +
        enrichment.benefits
          .map((benefit) => `<li>${escapeHtml(benefit.trim())}</li>`)
          .join("") +
        "</ul>"
    );
  }

  const specEntries = Object.entries(enrichment.specifications).filter(
    ([, value]) => value.trim().length > 0
  );
  if (specEntries.length > 0) {
    parts.push("<h3>Tekniske spesifikasjoner</h3>");
    parts.push("<ul>");
    for (const [key, value] of specEntries) {
      parts.push(`<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</li>`);
    }
    parts.push("</ul>");
  }

  if (enrichment.packageContents.trim()) {
    parts.push("<h3>Pakkens innhold</h3>");
    // Render as list when the contents contain multiple lines/items
    const contentLines = enrichment.packageContents
      .split(/\n|(?<=\.)\s+(?=\d+\s*x)/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (contentLines.length > 1) {
      parts.push(
        "<ul>" + contentLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("") + "</ul>"
      );
    } else {
      parts.push(`<p>${escapeHtml(enrichment.packageContents.trim())}</p>`);
    }
  }

  if (options.includeDeliveryAndWarranty !== false) {
    const deliveryTime = options.deliveryTime || DEFAULT_DELIVERY_TIME;
    parts.push("<h3>Levering</h3>");
    parts.push(
      `<p>Estimert leveringstid: ${escapeHtml(deliveryTime)}. Fri frakt på ordre over 500 kr.</p>`
    );
    // Legal/reklamasjon stays discreet — storefront tabs also show a footer note
    parts.push(
      `<p class="text-muted"><small>2 års garanti. Reklamasjonsrett etter norsk forbrukerkjøpslov.</small></p>`
    );
  }

  return parts.join("\n");
}
