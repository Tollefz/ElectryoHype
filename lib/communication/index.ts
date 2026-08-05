/**
 * International communication layer — locale → templates → notify.
 * No AI translation. Identity of copy comes from catalogs + Locale Engine.
 */

export type { LocaleCode, LanguageProfile } from "./language-profile";
export {
  registerLanguageProfile,
  getLanguageProfile,
  listLanguageProfiles,
} from "./language-profile";

export {
  normalizeLocale,
  resolveLocale,
  resolveLanguageProfile,
  getStoreDefaultLocale,
  type LocaleResolveInput,
} from "./locale-engine";

export {
  renderTemplate,
  registerTemplate,
  interpolate,
  listMessageTypes,
} from "./template-engine";

export {
  deliverNotification,
  type NotifyResult,
} from "./notification-engine";

export {
  composeMessage,
  sendComposedMessage,
  communicateOrderEvent,
  type ComposeResult,
} from "./communication-engine";

export type {
  MessageType,
  CommunicationChannel,
  TemplateVars,
  RenderedMessage,
  ComposeInput,
} from "./types";
