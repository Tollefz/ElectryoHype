import { trackServerPurchase } from "@/lib/analytics/meta-capi";
import { SITE_CONFIG } from "@/lib/site";

type OrderLike = {
  orderNumber: string;
  total: number;
  customerEmail?: string | null;
  items?: unknown;
};

function parseItems(raw: unknown): Array<{
  id: string;
  name: string;
  quantity: number;
  price: number;
}> {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: String(row.productId || row.id || `line-${index}`),
      name: String(row.name || row.title || row.productName || "Produkt"),
      quantity: Number(row.quantity || 1),
      price: Number(row.price || 0),
    };
  });
}

/** Best-effort server purchase for Meta CAPI + GA4 MP after Stripe marks order paid. */
export async function firePurchaseAnalytics(order: OrderLike): Promise<void> {
  try {
    const items = parseItems(order.items);
    await trackServerPurchase({
      transactionId: order.orderNumber,
      value: Number(order.total) || 0,
      currency: "NOK",
      email: order.customerEmail,
      items,
      eventSourceUrl: `${SITE_CONFIG.siteUrl}/order-confirmation`,
      eventId: `purchase_${order.orderNumber}`,
    });

    // First-party Marketing pipeline (server-side purchase — reliable)
    const { ingestMarketingEvent } = await import("@/lib/marketing/pipeline");
    await ingestMarketingEvent({
      event: "purchase",
      transactionId: order.orderNumber,
      value: Number(order.total) || 0,
      currency: "NOK",
      productId: items[0]?.id,
      productName: items[0]?.name,
      source: "stripe",
      medium: "payment",
      meta: { item_count: items.length },
    });
  } catch (err) {
    console.error("[analytics] firePurchaseAnalytics failed:", err);
  }
}
