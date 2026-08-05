/**
 * Communication Engine — single entry for international customer messaging.
 *
 * customer.locale → Locale Engine → templates → Notification Engine
 * Never hardcode a language in callers.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { SITE_CONFIG } from "@/lib/site";
import {
  getStoreDefaultLocale,
  resolveLocale,
  resolveLanguageProfile,
} from "./locale-engine";
import { renderTemplate } from "./template-engine";
import { deliverNotification, type NotifyResult } from "./notification-engine";
import type {
  CommunicationChannel,
  ComposeInput,
  MessageType,
  RenderedMessage,
  TemplateVars,
} from "./types";

export type ComposeResult = {
  message: RenderedMessage;
  locale: string;
  languageDisplayName: string;
};

/**
 * Resolve locale + render templates only (no send).
 */
export function composeMessage(input: ComposeInput): ComposeResult {
  const locale = resolveLocale({
    customerLocale: input.customerLocale,
    orderLocale: input.orderLocale,
    storeDefaultLocale:
      input.storeDefaultLocale || getStoreDefaultLocale(),
    acceptLanguage: input.acceptLanguage,
    countryCode: input.countryCode,
  });
  const profile = resolveLanguageProfile({
    customerLocale: locale,
    storeDefaultLocale: getStoreDefaultLocale(),
  });
  const message = renderTemplate(input.messageType, locale, input.vars || {});
  return {
    message,
    locale: message.locale,
    languageDisplayName: profile.displayName,
  };
}

/**
 * Compose and deliver on a channel.
 */
export async function sendComposedMessage(input: ComposeInput & {
  channel: CommunicationChannel;
  to: string;
  meta?: Record<string, unknown>;
}): Promise<ComposeResult & { delivery: NotifyResult }> {
  const composed = composeMessage(input);
  const delivery = await deliverNotification({
    channel: input.channel,
    to: input.to,
    message: composed.message,
    meta: input.meta,
  });
  return { ...composed, delivery };
}

const KIND_TO_MESSAGE: Record<string, MessageType> = {
  order_received: "order_confirmation",
  payment_approved: "payment_approved",
  tracking_received: "shipping",
  shipped: "shipping",
  delivered: "delivered",
  problem: "problem",
  delay: "delay",
  reminder: "reminder",
  order_confirmation: "order_confirmation",
  shipping: "shipping",
};

function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string
): string {
  const cur = (currency || "NOK").toUpperCase();
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${cur}`;
  }
}

/**
 * Load order + customer, resolve locale, compose vars, optionally send email.
 * Prefer this from automation instead of hardcoding Norwegian subjects.
 */
export async function communicateOrderEvent(input: {
  orderId: string;
  kind: string;
  detail?: string | null;
  channel?: CommunicationChannel;
  /** When false, only compose (for React Email subjects / previews) */
  send?: boolean;
}): Promise<{
  composed: ComposeResult;
  delivery: NotifyResult | null;
  to: string | null;
  messageType: MessageType;
}> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { customer: true },
  });
  if (!order) {
    const composed = composeMessage({
      messageType: "problem",
      vars: { detail: "Order not found", storeName: SITE_CONFIG.siteName },
    });
    return {
      composed,
      delivery: {
        ok: false,
        channel: input.channel || "email",
        error: "order_not_found",
      },
      to: null,
      messageType: "problem",
    };
  }

  const messageType =
    KIND_TO_MESSAGE[input.kind] || ("reminder" as MessageType);

  const customerLocale =
    order.customer &&
    typeof (order.customer as { locale?: string | null }).locale === "string"
      ? (order.customer as { locale?: string | null }).locale
      : null;

  const shipping =
    order.shippingAddress && typeof order.shippingAddress === "object"
      ? (order.shippingAddress as Record<string, unknown>)
      : {};
  const countryCode =
    typeof shipping.country === "string"
      ? shipping.country
      : typeof shipping.countryCode === "string"
        ? shipping.countryCode
        : null;

  const storeName = SITE_CONFIG.siteName || "Store";
  const customerName =
    order.customer?.name ||
    (typeof shipping.name === "string" ? shipping.name : null) ||
    order.customerEmail?.split("@")[0] ||
    "there";

  const locale = resolveLocale({
    customerLocale,
    countryCode,
    storeDefaultLocale: getStoreDefaultLocale(),
  });

  const vars: TemplateVars = {
    storeName,
    customerName,
    orderNumber: order.orderNumber,
    totalFormatted: formatMoney(order.total, "NOK", locale),
    trackingNumber: order.trackingNumber || null,
    trackingUrl: order.trackingUrl || null,
    detail: input.detail || null,
  };

  const composed = composeMessage({
    messageType,
    vars,
    customerLocale,
    countryCode,
    storeDefaultLocale: getStoreDefaultLocale(),
  });

  const to = order.customerEmail || order.customer?.email || null;
  if (input.send === false) {
    return { composed, delivery: null, to, messageType };
  }

  if (!to) {
    return {
      composed,
      delivery: {
        ok: false,
        channel: input.channel || "email",
        error: "missing_recipient",
      },
      to: null,
      messageType,
    };
  }

  // Rich React Email still owns confirmation + shipping HTML for now.
  // Communication engine owns locale + subjects + text for all kinds;
  // for shipped/confirmation prefer existing branded senders when send=true
  // only for kinds without rich templates.
  const useLegacyRich =
    messageType === "shipping" || messageType === "order_confirmation";

  if (useLegacyRich && messageType === "shipping") {
    const { sendShippingNotification } = await import("@/lib/email");
    const result = await sendShippingNotification(input.orderId).catch(
      (err: unknown) => ({
        success: false as const,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return {
      composed,
      delivery: {
        ok: Boolean(result?.success),
        channel: "email",
        error: result && "error" in result ? result.error : undefined,
      },
      to,
      messageType,
    };
  }

  if (useLegacyRich && messageType === "order_confirmation") {
    const { sendOrderConfirmation } = await import("@/lib/email");
    const result = await sendOrderConfirmation(input.orderId).catch(
      (err: unknown) => ({
        success: false as const,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return {
      composed,
      delivery: {
        ok: Boolean(result?.success),
        channel: "email",
        error: result && "error" in result ? result.error : undefined,
      },
      to,
      messageType,
    };
  }

  const delivery = await deliverNotification({
    channel: input.channel || "email",
    to,
    message: composed.message,
    meta: { orderId: input.orderId, kind: input.kind },
  });

  return { composed, delivery, to, messageType };
}
