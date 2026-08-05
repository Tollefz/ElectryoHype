/**
 * Template Engine — render locale catalogs with {{vars}} and {{#optional}} blocks.
 * Templates are human-authored. No AI translation at render time.
 */

import { MESSAGE_TEMPLATES } from "./catalog";
import { getLanguageProfile, type LocaleCode } from "./language-profile";
import { normalizeLocale } from "./locale-engine";
import type {
  MessageType,
  RenderedMessage,
  TemplateVars,
} from "./types";
import type { TemplateStrings } from "./catalog";

const customTemplates = new Map<
  string,
  Partial<Record<LocaleCode, TemplateStrings>>
>();

/** Register / override a template for a message type + locale (marketplace extensibility). */
export function registerTemplate(
  messageType: MessageType,
  locale: LocaleCode,
  strings: TemplateStrings
): void {
  const loc = normalizeLocale(locale) || locale;
  const existing = customTemplates.get(messageType) || {};
  existing[loc] = strings;
  customTemplates.set(messageType, existing);
}

function lookupTemplate(
  messageType: MessageType,
  locale: LocaleCode
): { strings: TemplateStrings; templateLocale: LocaleCode } | null {
  const custom = customTemplates.get(messageType);
  if (custom?.[locale]) {
    return { strings: custom[locale]!, templateLocale: locale };
  }

  const map = MESSAGE_TEMPLATES[messageType];
  if (!map) return null;

  if (map[locale]) {
    return { strings: map[locale]!, templateLocale: locale };
  }

  const lang = locale.split("-")[0]?.toLowerCase();
  if (lang) {
    const langHit = Object.entries(map).find(([k]) =>
      k.toLowerCase().startsWith(`${lang}-`)
    );
    if (langHit) {
      return {
        strings: langHit[1] as TemplateStrings,
        templateLocale: langHit[0],
      };
    }
    if (custom) {
      const cHit = Object.entries(custom).find(([k]) =>
        k.toLowerCase().startsWith(`${lang}-`)
      );
      if (cHit?.[1]) {
        return { strings: cHit[1], templateLocale: cHit[0] };
      }
    }
  }

  if (map["en-US"]) {
    return { strings: map["en-US"], templateLocale: "en-US" };
  }
  return null;
}

/**
 * Replace {{key}} and strip/keep {{#key}}...{{/key}} when value is truthy.
 */
export function interpolate(
  template: string,
  vars: TemplateVars
): string {
  let out = template;

  // Optional blocks first
  out = out.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key: string, inner: string) => {
      const v = vars[key];
      if (v == null || v === false || v === "") return "";
      return inner;
    }
  );

  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function textToSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const body = escaped.replace(/\n/g, "<br/>\n");
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">${body}</body></html>`;
}

/**
 * Render a message for a resolved locale. Falls back to en-US, then any available.
 */
export function renderTemplate(
  messageType: MessageType,
  locale: LocaleCode,
  vars: TemplateVars = {}
): RenderedMessage {
  const profile = getLanguageProfile(locale);
  const found = lookupTemplate(messageType, profile.locale);

  if (!found) {
    const subject = `[${messageType}]`;
    const text = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v ?? ""}`)
      .join("\n");
    return {
      messageType,
      locale: profile.locale,
      languageDisplayName: profile.displayName,
      subject,
      text: text || messageType,
      html: textToSimpleHtml(text || messageType),
      templateLocale: "en-US",
    };
  }

  const subject = interpolate(found.strings.subject, vars);
  const text = interpolate(found.strings.text, vars);
  const html = found.strings.html
    ? interpolate(found.strings.html, vars)
    : textToSimpleHtml(text);

  return {
    messageType,
    locale: profile.locale,
    languageDisplayName: profile.displayName,
    subject,
    text,
    html,
    templateLocale: found.templateLocale,
  };
}

export function listMessageTypes(): MessageType[] {
  return Object.keys(MESSAGE_TEMPLATES) as MessageType[];
}

/** Test helper */
export function resetTemplatesForTests(): void {
  customTemplates.clear();
}
