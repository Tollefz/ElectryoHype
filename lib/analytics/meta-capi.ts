import { createHash } from "crypto";
import { getServerAnalyticsConfig } from "@/lib/analytics/config";

type PurchasePayload = {
  transactionId: string;
  value: number;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  eventSourceUrl?: string;
  eventId?: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Meta Conversions API — Purchase (server-side, complements browser Pixel).
 */
export async function sendMetaPurchase(payload: PurchasePayload): Promise<void> {
  const { metaAccessToken, metaPixelIdServer } = getServerAnalyticsConfig();
  if (!metaAccessToken || !metaPixelIdServer) return;

  const eventId = payload.eventId || `purchase_${payload.transactionId}`;
  const userData: Record<string, string> = {};
  if (payload.email) userData.em = sha256(payload.email);
  if (payload.phone) userData.ph = sha256(payload.phone.replace(/\D/g, ""));

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: payload.eventSourceUrl,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: payload.currency || "NOK",
          value: payload.value,
          content_type: "product",
          content_ids: payload.items.map((i) => i.id),
          contents: payload.items.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            item_price: i.price,
          })),
          order_id: payload.transactionId,
        },
      },
    ],
  };

  try {
    await fetch(
      `https://graph.facebook.com/v19.0/${metaPixelIdServer}/events?access_token=${encodeURIComponent(metaAccessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error("[meta-capi] Purchase failed:", err);
  }
}

export async function sendMetaRefund(payload: {
  transactionId: string;
  value: number;
  currency?: string;
  email?: string | null;
}): Promise<void> {
  const { metaAccessToken, metaPixelIdServer } = getServerAnalyticsConfig();
  if (!metaAccessToken || !metaPixelIdServer) return;

  const userData: Record<string, string> = {};
  if (payload.email) userData.em = sha256(payload.email);

  const body = {
    data: [
      {
        event_name: "Refund",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `refund_${payload.transactionId}`,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: payload.currency || "NOK",
          value: payload.value,
          order_id: payload.transactionId,
        },
      },
    ],
  };

  try {
    await fetch(
      `https://graph.facebook.com/v19.0/${metaPixelIdServer}/events?access_token=${encodeURIComponent(metaAccessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error("[meta-capi] Refund failed:", err);
  }
}

/**
 * GA4 Measurement Protocol — purchase / refund (server).
 */
export async function sendGa4ServerEvent(
  name: "purchase" | "refund",
  payload: {
    transactionId: string;
    value: number;
    currency?: string;
    items?: Array<{ id: string; name: string; quantity: number; price: number }>;
    clientId?: string;
  }
): Promise<void> {
  const { gaApiSecret, gaMeasurementIdServer } = getServerAnalyticsConfig();
  if (!gaApiSecret || !gaMeasurementIdServer) return;

  const clientId = payload.clientId || `server.${payload.transactionId}`;

  const body = {
    client_id: clientId,
    events: [
      {
        name,
        params: {
          transaction_id: payload.transactionId,
          value: payload.value,
          currency: payload.currency || "NOK",
          items: (payload.items || []).map((i) => ({
            item_id: i.id,
            item_name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
    ],
  };

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(gaMeasurementIdServer)}&api_secret=${encodeURIComponent(gaApiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error("[ga4-mp] event failed:", err);
  }
}

/** Fire server purchase to Meta CAPI + GA4 MP (best-effort). */
export async function trackServerPurchase(payload: PurchasePayload): Promise<void> {
  await Promise.all([
    sendMetaPurchase(payload),
    sendGa4ServerEvent("purchase", {
      transactionId: payload.transactionId,
      value: payload.value,
      currency: payload.currency,
      items: payload.items,
    }),
  ]);
}

export async function trackServerRefund(payload: {
  transactionId: string;
  value: number;
  currency?: string;
  email?: string | null;
  items?: Array<{ id: string; name: string; quantity: number; price: number }>;
}): Promise<void> {
  await Promise.all([
    sendMetaRefund(payload),
    sendGa4ServerEvent("refund", {
      transactionId: payload.transactionId,
      value: payload.value,
      currency: payload.currency,
      items: payload.items,
    }),
  ]);
}
