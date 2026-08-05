import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

/** Require INTERNAL_CRON_TOKEN via x-internal-token header. */
export function requireInternalToken(req: Request): NextResponse | null {
  const secret = req.headers.get("x-internal-token");
  const expected = process.env.INTERNAL_CRON_TOKEN;
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Debug endpoints: 404 in production; require internal token otherwise. */
export function requireDebugAccess(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (process.env.DEBUG_API_OPEN === "true") {
    return null;
  }
  return requireInternalToken(req);
}

export async function requireAdminSession(): Promise<
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse }
> {
  const session = await getAuthSession();
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    userId: session.user.id || "admin",
    email: session.user.email ?? null,
  };
}

type PublicOrderItem = {
  name?: unknown;
  productName?: unknown;
  product?: { name?: unknown } | null;
  quantity?: unknown;
  price?: unknown;
  variantName?: unknown;
};

type ShippingAddressLike = {
  city?: unknown;
  postalCode?: unknown;
  country?: unknown;
};

/** Public-safe order payload — strips customer PII and supplier internals. */
export function toPublicOrder(order: Record<string, unknown>) {
  const shippingAddr =
    order.shippingAddress && typeof order.shippingAddress === "object"
      ? (order.shippingAddress as ShippingAddressLike)
      : null;
  const shipping = shippingAddr
      ? {
          city: shippingAddr.city ?? null,
          postalCode: shippingAddr.postalCode ?? null,
          country: shippingAddr.country ?? "NO",
        }
      : {};

  const items = Array.isArray(order.items)
    ? order.items.map((item: PublicOrderItem) => ({
        name: item.name || item.productName || item.product?.name || "Produkt",
        quantity: item.quantity,
        price: item.price,
        variantName: item.variantName ?? null,
      }))
    : [];

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    status: order.status,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    tax: order.tax,
    total: order.total,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    shippingCarrier: order.shippingCarrier,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items,
    shippingAddress: shipping,
    // Explicitly omit: customerEmail, customer, paymentIntentId details dump, supplier fields
  };
}
