/**
 * Allowlist HTML sanitizer for customer-facing product descriptions.
 * Strips scripts, event handlers, and dangerous URLs without a heavy dependency.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const ALLOWED_ATTRS = new Set(["class"]);

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith("javascript:") || v.startsWith("data:") || v.startsWith("vbscript:")) {
    return false;
  }
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/") || v.startsWith("#");
}

/**
 * Sanitize untrusted HTML for safe use with dangerouslySetInnerHTML.
 */
export function sanitizeHtmlForDisplay(input: string): string {
  if (!input || typeof input !== "string") return "";

  const html = input
    // Remove null bytes and control chars except whitespace
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    // Strip comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove whole dangerous elements including content
    .replace(/<(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[^>]*\/?>/gi, "");

  // Tokenize tags; keep text, rebuild allowed tags only
  const parts = html.split(/(<[^>]+>)/g);
  const out: string[] = [];

  for (const part of parts) {
    if (!part.startsWith("<")) {
      out.push(part);
      continue;
    }

    const closeMatch = part.match(/^<\/\s*([a-z0-9]+)\s*>$/i);
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      if (ALLOWED_TAGS.has(tag)) out.push(`</${tag}>`);
      continue;
    }

    const selfBr = part.match(/^<\s*br\s*\/?\s*>$/i);
    if (selfBr) {
      out.push("<br />");
      continue;
    }

    const openMatch = part.match(/^<\s*([a-z0-9]+)([^>]*)\/?\s*>$/i);
    if (!openMatch) continue;

    const tag = openMatch[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) continue;

    const attrBlob = openMatch[2] || "";
    const safeAttrs: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrBlob))) {
      const name = m[1].toLowerCase();
      const value = m[2] ?? m[3] ?? m[4] ?? "";
      if (name.startsWith("on")) continue;
      if (name === "href" || name === "src") {
        if (tag === "a" && name === "href" && isSafeUrl(value)) {
          // anchors not in allowlist currently — skip
        }
        continue;
      }
      if (ALLOWED_ATTRS.has(name)) {
        const cleaned = value.replace(/[<>"'`]/g, "");
        safeAttrs.push(`${name}="${cleaned}"`);
      }
    }

    const selfClosing = tag === "br";
    if (selfClosing) {
      out.push("<br />");
    } else if (safeAttrs.length) {
      out.push(`<${tag} ${safeAttrs.join(" ")}>`);
    } else {
      out.push(`<${tag}>`);
    }
  }

  return out.join("").trim();
}

/**
 * Escape plain text for HTML display (when description is not HTML).
 */
export function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Detect rough HTML vs plain text. */
export function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text || "");
}

/**
 * Prepare product description for safe rendering.
 * Plain text is escaped and wrapped; HTML is sanitized.
 */
export function prepareDescriptionHtml(description: string): string {
  if (!description) return "";
  if (looksLikeHtml(description)) {
    return sanitizeHtmlForDisplay(description);
  }
  return `<p>${escapeHtml(description).replace(/\n/g, "<br />")}</p>`;
}
