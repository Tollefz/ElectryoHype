/**
 * Standard GA4 e-commerce events → dataLayer + gtag + Meta + TikTok.
 * Keep payloads consistent across the storefront funnel.
 * Also beacons first-party Marketing pipeline for Mission Control learning.
 */

import { beaconMarketingEvent } from "@/lib/marketing/beacon";

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
  index?: number;
  discount?: number;
};

export type EcommerceEventName =
  | "page_view"
  | "view_item"
  | "view_item_list"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "purchase"
  | "refund"
  | "view_promotion"
  | "select_promotion";

type EcommercePayload = {
  currency?: string;
  value?: number;
  transaction_id?: string;
  shipping?: number;
  tax?: number;
  coupon?: string;
  items?: AnalyticsItem[];
  item_list_id?: string;
  item_list_name?: string;
  search_term?: string;
  creative_name?: string;
  creative_slot?: string;
  promotion_id?: string;
  promotion_name?: string;
};

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: {
      track: (event: string, payload?: Record<string, unknown>) => void;
      page: () => void;
    };
  }
}

const CURRENCY = "NOK";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function pushDataLayer(obj: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(obj);
}

function gtagEvent(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

/** Map GA4 events → Meta standard events where applicable */
function metaEvent(name: EcommerceEventName, payload: EcommercePayload) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;

  const contentIds = (payload.items || []).map((i) => i.item_id);
  const contents = (payload.items || []).map((i) => ({
    id: i.item_id,
    quantity: i.quantity,
    item_price: i.price,
  }));
  const value = payload.value ?? 0;

  const map: Partial<Record<EcommerceEventName, string>> = {
    view_item: "ViewContent",
    add_to_cart: "AddToCart",
    begin_checkout: "InitiateCheckout",
    purchase: "Purchase",
    search: "Search",
    view_item_list: "ViewContent",
  };

  const metaName = map[name];
  if (!metaName) return;

  const params: Record<string, unknown> = {
    content_type: "product",
    content_ids: contentIds,
    contents,
    value,
    currency: payload.currency || CURRENCY,
  };
  if (name === "search" && payload.search_term) {
    params.search_string = payload.search_term;
  }
  if (name === "purchase" && payload.transaction_id) {
    params.order_id = payload.transaction_id;
  }

  window.fbq("track", metaName, params);
}

function tiktokEvent(name: EcommerceEventName, payload: EcommercePayload) {
  if (typeof window === "undefined" || !window.ttq?.track) return;

  const map: Partial<Record<EcommerceEventName, string>> = {
    view_item: "ViewContent",
    add_to_cart: "AddToCart",
    begin_checkout: "InitiateCheckout",
    purchase: "CompletePayment",
    search: "Search",
  };
  const ttName = map[name];
  if (!ttName) return;

  window.ttq.track(ttName, {
    content_type: "product",
    content_id: (payload.items || []).map((i) => i.item_id).join(","),
    contents: (payload.items || []).map((i) => ({
      content_id: i.item_id,
      content_name: i.item_name,
      quantity: i.quantity,
      price: i.price,
    })),
    value: payload.value ?? 0,
    currency: payload.currency || CURRENCY,
    query: payload.search_term,
  });
}

/**
 * Fire a standard ecommerce event to all active marketing tags.
 */
export function trackEcommerce(
  event: EcommerceEventName,
  payload: EcommercePayload = {}
) {
  if (typeof window === "undefined") return;

  const currency = payload.currency || CURRENCY;
  const params: Record<string, unknown> = {
    ...payload,
    currency,
  };
  if (typeof payload.value === "number") {
    params.value = roundMoney(payload.value);
  }

  // GA4 ecommerce clear → push pattern for GTM
  pushDataLayer({ ecommerce: null });
  pushDataLayer({
    event,
    ecommerce: {
      currency,
      value: params.value,
      transaction_id: payload.transaction_id,
      shipping: payload.shipping,
      tax: payload.tax,
      coupon: payload.coupon,
      items: payload.items,
      item_list_id: payload.item_list_id,
      item_list_name: payload.item_list_name,
      creative_name: payload.creative_name,
      creative_slot: payload.creative_slot,
      promotion_id: payload.promotion_id,
      promotion_name: payload.promotion_name,
    },
    search_term: payload.search_term,
  });

  gtagEvent(event, params);
  metaEvent(event, { ...payload, currency, value: params.value as number });
  tiktokEvent(event, { ...payload, currency, value: params.value as number });

  beaconMarketingEvent({
    event,
    value: typeof params.value === "number" ? params.value : undefined,
    currency,
    transactionId: payload.transaction_id,
    items: payload.items,
    meta: {
      item_list_id: payload.item_list_id,
      item_list_name: payload.item_list_name,
      search_term: payload.search_term,
      promotion_id: payload.promotion_id,
    },
  });
}

export function trackPageView(path: string, title?: string) {
  if (typeof window === "undefined") return;

  pushDataLayer({
    event: "page_view",
    page_path: path,
    page_title: title || document.title,
  });

  if (typeof window.gtag === "function") {
    const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (gaId) {
      window.gtag("config", gaId, { page_path: path });
    }
  }

  if (typeof window.fbq === "function") {
    window.fbq("track", "PageView");
  }
  if (window.ttq?.page) {
    window.ttq.page();
  }

  beaconMarketingEvent({
    event: "page_view",
    path,
    meta: { page_title: title || document.title },
  });
}

export function cartItemToAnalyticsItem(
  item: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    variantName?: string;
    category?: string;
  },
  index?: number
): AnalyticsItem {
  return {
    item_id: item.productId,
    item_name: item.name,
    item_brand: "ElectroHypeX",
    item_category: item.category,
    item_variant: item.variantName,
    price: roundMoney(item.price),
    quantity: item.quantity,
    index,
  };
}

export function itemsValue(items: AnalyticsItem[]): number {
  return roundMoney(
    items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  );
}
