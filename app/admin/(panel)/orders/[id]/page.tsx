import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { safeQuery } from "@/lib/safeQuery";
import { normalizeOrderLineItems } from "@/lib/email-items";
import OrderDetailWorkspace, {
  type OrderWorkspaceOrder,
} from "@/components/admin/orders/OrderDetailWorkspace";

interface ShippingAddress {
  name?: string;
  address?: string;
  address1?: string;
  address2?: string;
  zip?: string;
  zipCode?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseShippingAddress(raw: unknown): ShippingAddress {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!isRecord(parsed)) return {};
  const str = (key: string) =>
    typeof parsed[key] === "string" ? (parsed[key] as string) : undefined;
  return {
    name: str("name"),
    address: str("address") ?? str("address1"),
    address1: str("address1"),
    address2: str("address2"),
    zip: str("zip") ?? str("zipCode") ?? str("postalCode"),
    zipCode: str("zipCode"),
    postalCode: str("postalCode"),
    city: str("city"),
    country: str("country"),
  };
}

async function getOrder(id: string) {
  if (!id || typeof id !== "string" || id.trim() === "") {
    return null;
  }

  const order = await safeQuery(
    () =>
      prisma.order.findUnique({
        where: { id: id.trim() },
        include: {
          customer: true,
          orderItems: {
            include: {
              product: true,
              variant: true,
            },
          },
          supplierEvents: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    null,
    "orders:detail"
  );

  if (!order) return null;

  const items = normalizeOrderLineItems({
    itemsJson: order.items,
    orderItems: order.orderItems,
  });

  const shippingAddress = parseShippingAddress(order.shippingAddress);

  const noteSetting = await prisma.setting.findUnique({
    where: { key: `order_internal_notes:${order.id}` },
  });
  const internalNotes =
    typeof noteSetting?.value === "string"
      ? noteSetting.value
      : order.internalNotes || null;

  return {
    ...order,
    items,
    shippingAddress,
    internalNotes,
  };
}

export default async function OrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "admin") {
    redirect("/admin/login");
  }

  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const productLines = order.items.map((item, index) => {
    const oi = order.orderItems.find(
      (row) =>
        row.variantName === item.variantName ||
        row.product?.name === item.name
    ) || order.orderItems[index];
    const supplierPrice =
      oi?.variant?.supplierPrice ?? oi?.product?.supplierPrice ?? null;
    const sku = oi?.variant?.sku ?? oi?.product?.sku ?? null;

    return {
      name: item.name,
      image: item.image,
      variantName: item.variantName,
      sku: sku || null,
      quantity: item.quantity || 1,
      price: item.price || 0,
      costNOK: supplierPrice,
      productUrl: item.productUrl,
    };
  });

  const workspaceOrder: OrderWorkspaceOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paymentIntentId: order.paymentIntentId,
    stripeSessionId: order.stripeSessionId,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    shippingCarrier: order.shippingCarrier,
    supplierOrderStatus: order.supplierOrderStatus,
    supplierOrderId: order.supplierOrderId,
    autoOrderError: order.autoOrderError,
    customerEmailStatus: order.customerEmailStatus,
    customerEmailLastError: order.customerEmailLastError,
    customerEmailSentAt: order.customerEmailSentAt
      ? order.customerEmailSentAt.toISOString()
      : null,
    customerEmail: order.customerEmail,
    supplierEvents: (order.supplierEvents || []).map((ev) => ({
      id: ev.id,
      oldStatus: ev.oldStatus,
      newStatus: ev.newStatus,
      createdAt: ev.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    internalNotes: order.internalNotes,
    notes: null,
    isTestOrder: order.isTestOrder,
    archivedAt: order.archivedAt ? order.archivedAt.toISOString() : null,
    subtotal: Number(order.subtotal) || 0,
    shippingCost: Number(order.shippingCost) || 0,
    tax: Number(order.tax) || 0,
    total: Number(order.total) || 0,
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
        }
      : null,
    shippingAddress: {
      name: order.shippingAddress?.name,
      address: order.shippingAddress?.address,
      address2: order.shippingAddress?.address2,
      zip: order.shippingAddress?.zip,
      city: order.shippingAddress?.city,
      country: order.shippingAddress?.country,
    },
    productLines,
  };

  return <OrderDetailWorkspace order={workspaceOrder} />;
}
