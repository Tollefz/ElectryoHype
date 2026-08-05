/**
 * Shared communication types.
 */

import type { LocaleCode } from "./language-profile";

/** Canonical message kinds for the whole platform */
export type MessageType =
  | "order_confirmation"
  | "shipping"
  | "delay"
  | "delivered"
  | "reminder"
  | "payment_approved"
  | "problem";

export type CommunicationChannel = "email" | "sms" | "push" | "in_app";

export type TemplateVars = Record<
  string,
  string | number | boolean | null | undefined
>;

export type RenderedMessage = {
  messageType: MessageType;
  locale: LocaleCode;
  languageDisplayName: string;
  subject: string;
  text: string;
  html: string;
  /** Which locale catalog entry was used (may differ after fallback) */
  templateLocale: LocaleCode;
};

export type ComposeInput = {
  messageType: MessageType;
  vars?: TemplateVars;
  customerLocale?: string | null;
  orderLocale?: string | null;
  storeDefaultLocale?: string | null;
  acceptLanguage?: string | null;
  countryCode?: string | null;
};
