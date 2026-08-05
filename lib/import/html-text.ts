/**
 * Conversion between product description HTML and readable plain text.
 *
 * The importer stores descriptions as HTML, but the admin editor must
 * never show raw HTML. These helpers convert HTML to a readable text
 * format (headings + bullet lists) and back, so the admin edits text
 * while the stored value stays valid HTML.
 *
 * Text format:
 *   Heading lines end with ":" on their own line.
 *   Bullet lines start with "• " (or "- " when typed manually).
 *   Paragraphs are separated by blank lines.
 *
 * Pure module – safe to use on both server and client.
 */

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert description HTML into readable, editable plain text. */
export function htmlToReadableText(html: string): string {
  if (!html) return "";
  if (!/[<>]/.test(html)) return html;

  let text = html
    // Headings become "Heading:" lines
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, content) => {
      const heading = content.replace(/<[^>]+>/g, "").trim();
      return `\n\n${heading}:\n`;
    })
    // List items become bullet lines
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
      const item = content.replace(/<[^>]+>/g, "").trim();
      return `• ${item}\n`;
    })
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<(ul|ol)[^>]*>/gi, "")
    // Paragraphs and line breaks
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // Keep bullet lists tight (no blank lines between items)
    .replace(/\n+(?=• )/g, "\n")
    .trim();

  return text;
}

/** Convert readable text (as produced above, or admin-edited) back to HTML. */
export function readableTextToHtml(text: string): string {
  if (!text) return "";
  if (/<\/(p|ul|li|h[1-6])>/i.test(text)) {
    // Already HTML (e.g. untouched value) – return as-is
    return text;
  }

  const lines = text.split("\n");
  const parts: string[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      parts.push("<ul>" + listItems.map((item) => `<li>${item}</li>`).join("") + "</ul>");
      listItems = [];
    }
  };

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      parts.push(`<p>${paragraph.join(" ")}</p>`);
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    // Bullet line
    if (/^[•\-*]\s+/.test(line)) {
      flushParagraph();
      const item = line.replace(/^[•\-*]\s+/, "").trim();
      // Preserve "Key: value" bolding for spec-style items
      const specMatch = item.match(/^([^:]{2,40}):\s+(.+)$/);
      if (specMatch) {
        listItems.push(`<strong>${escapeHtml(specMatch[1])}:</strong> ${escapeHtml(specMatch[2])}`);
      } else {
        listItems.push(escapeHtml(item));
      }
      continue;
    }

    // Heading line: short line ending with ":"
    if (/^[^•\-*].{1,60}:$/.test(line)) {
      flushList();
      flushParagraph();
      parts.push(`<h3>${escapeHtml(line.slice(0, -1).trim())}</h3>`);
      continue;
    }

    // Paragraph text
    flushList();
    paragraph.push(escapeHtml(line));
  }

  flushList();
  flushParagraph();

  return parts.join("\n");
}
