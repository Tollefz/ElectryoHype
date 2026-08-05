"use client";

import {
  TrackSearch,
  TrackViewItemList,
} from "@/components/analytics/TrackEvents";
import type { AnalyticsItem } from "@/lib/analytics/ecommerce";

export function ListingAnalytics({
  listId,
  listName,
  items,
  searchTerm,
}: {
  listId: string;
  listName: string;
  items: AnalyticsItem[];
  searchTerm?: string;
}) {
  return (
    <>
      {searchTerm ? <TrackSearch term={searchTerm} /> : null}
      <TrackViewItemList listId={listId} listName={listName} items={items} />
    </>
  );
}
