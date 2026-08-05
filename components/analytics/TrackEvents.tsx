"use client";

import { useEffect, useRef } from "react";
import {
  trackEcommerce,
  type AnalyticsItem,
  itemsValue,
} from "@/lib/analytics/ecommerce";

export function TrackViewItem({
  item,
}: {
  item: AnalyticsItem;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEcommerce("view_item", {
      currency: "NOK",
      value: itemsValue([item]),
      items: [item],
    });
  }, [item]);

  return null;
}

export function TrackViewItemList({
  listId,
  listName,
  items,
}: {
  listId: string;
  listName: string;
  items: AnalyticsItem[];
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || items.length === 0) return;
    sent.current = true;
    trackEcommerce("view_item_list", {
      item_list_id: listId,
      item_list_name: listName,
      items,
    });
  }, [listId, listName, items]);

  return null;
}

export function TrackSearch({ term }: { term: string }) {
  const sent = useRef(false);

  useEffect(() => {
    const q = term.trim();
    if (!q || sent.current) return;
    sent.current = true;
    trackEcommerce("search", { search_term: q });
  }, [term]);

  return null;
}

export function TrackPurchaseOnce({
  transactionId,
  value,
  shipping,
  tax,
  items,
}: {
  transactionId: string;
  value: number;
  shipping?: number;
  tax?: number;
  items: AnalyticsItem[];
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (!transactionId || sent.current) return;
    const key = `ehx_purchase_${transactionId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    sent.current = true;
    trackEcommerce("purchase", {
      transaction_id: transactionId,
      value,
      shipping,
      tax,
      currency: "NOK",
      items,
    });
  }, [transactionId, value, shipping, tax, items]);

  return null;
}

export function TrackPromotionView({
  promotionId,
  promotionName,
  creativeName,
  creativeSlot,
}: {
  promotionId: string;
  promotionName: string;
  creativeName?: string;
  creativeSlot?: string;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEcommerce("view_promotion", {
      promotion_id: promotionId,
      promotion_name: promotionName,
      creative_name: creativeName,
      creative_slot: creativeSlot,
    });
  }, [promotionId, promotionName, creativeName, creativeSlot]);

  return null;
}
