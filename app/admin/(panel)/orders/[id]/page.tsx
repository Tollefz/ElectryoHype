import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import OrderDetailsClient from "./OrderDetailsClient";
import { safeQuery } from "@/lib/safeQuery";

async function getOrder(id: string) {
  // Valider id
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

  if (!order) {
    return null;
  }

  // Parse items fra JSON
  let items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    image?: string | null;
    variantId?: string | null;
    variantName?: string | null;
  }> = [];
  try {
    if (typeof order.items === "string") {
      const parsed = JSON.parse(order.items);
      items = Array.isArray(parsed) ? parsed : [];
    } else if (order.items && typeof order.items === "object" && Array.isArray(order.items)) {
      items = order.items as typeof items;
    }
  } catch {
    // Hvis parsing feiler, bruk orderItems
    items = order.orderItems.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      price: item.price,
      quantity: item.quantity,
      image: item.product.images ? JSON.parse(item.product.images)[0] : null,
      variantId: item.variantId || undefined,
      variantName: item.variantName || undefined,
    }));
  }

  // Parse shipping address
  let shippingAddress: any = {};
  try {
    if (typeof order.shippingAddress === "string") {
      shippingAddress = JSON.parse(order.shippingAddress);
    } else if (order.shippingAddress) {
      shippingAddress = order.shippingAddress;
    }
  } catch {
    shippingAddress = {};
  }

  return {
    ...order,
    items,
    shippingAddress,
    supplierOrderStatus: order.supplierOrderStatus,
    supplierOrderId: order.supplierOrderId,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    autoOrderError: order.autoOrderError,
  };
}

function getFulfillmentStatusBadge(fulfillmentStatus: string) {
  const statusMap: Record<string, { label: string; className: string }> = {
    NEW: { label: "NY", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    ORDERED_FROM_SUPPLIER: { label: "Bestilt hos leverandør", className: "bg-blue-100 text-blue-800 border-blue-300" },
    SHIPPED: { label: "Sendt", className: "bg-indigo-100 text-indigo-800 border-indigo-300" },
    DELIVERED: { label: "Fullført", className: "bg-green-100 text-green-800 border-green-300" },
    CANCELLED: { label: "Kansellert", className: "bg-red-100 text-red-800 border-red-300" },
  };

  const config = statusMap[fulfillmentStatus] || {
    label: fulfillmentStatus,
    className: "bg-gray-100 text-gray-800 border-gray-300",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function getPaymentStatusBadge(status: string) {
  const statusMap: Record<string, { label: string; className: string }> = {
    pending: { label: "Venter", className: "bg-yellow-100 text-yellow-800" },
    paid: { label: "Betalt", className: "bg-green-100 text-green-800" },
    failed: { label: "Feilet", className: "bg-red-100 text-red-800" },
    refunded: { label: "Refundert", className: "bg-gray-100 text-gray-800" },
  };

  const config = statusMap[status.toLowerCase()] || {
    label: status,
    className: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}


export default async function OrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== "admin") {
    redirect("/admin/login");
  }

  // Håndter både sync og async params (Next.js 14 vs 15)
  const resolvedParams = params instanceof Promise ? await params : params;
  const order: any = await getOrder(resolvedParams.id);

  if (!order) {
    notFound();
  }

  const totalItems = order.items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/orders"
            className="text-sm text-gray-600 hover:text-gray-900 mb-2 inline-block"
          >
            ← Tilbake til ordrer
          </Link>
          <h1 className="text-3xl font-bold">Ordre detaljer</h1>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">{order.orderNumber}</div>
          <div className="text-sm text-gray-500">{formatDate(order.createdAt)}</div>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-4">
        {getFulfillmentStatusBadge(order.fulfillmentStatus || "NEW")}
        {getPaymentStatusBadge(order.paymentStatus)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hovedinnhold */}
        <div className="lg:col-span-2 space-y-6">
          {/* Kunde informasjon */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Kunde informasjon</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Navn</label>
                <p className="mt-1 text-gray-900">{order.customer?.name || "-"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">E-post</label>
                <p className="mt-1 text-gray-900">{order.customer?.email || "-"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Telefon</label>
                <p className="mt-1 text-gray-900">{order.customer?.phone || "-"}</p>
              </div>
            </div>
          </div>

          {/* Leveringsadresse */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Leveringsadresse</h2>
            <div className="space-y-2 text-gray-900">
              <p className="font-medium">
                {order.shippingAddress?.name || order.customer?.name || "-"}
              </p>
              <p>{order.shippingAddress?.address || "-"}</p>
              <p>
                {order.shippingAddress?.zip || ""} {order.shippingAddress?.city || ""}
              </p>
              {order.shippingAddress?.country && (
                <p>{order.shippingAddress.country}</p>
              )}
              {order.shippingAddress?.shippingMethod && (
                <p className="text-sm text-gray-500 mt-2">
                  Fraktmetode: {order.shippingAddress.shippingMethod}
                </p>
              )}
            </div>
          </div>

          {/* Produkter */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Produkter</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                      Produkt
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                      Antall
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      Pris per stk
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.items.map((item: any, index: number) => {
                    const itemPrice = Number(item.price) || 0;
                    const quantity = Number(item.quantity) || 1;
                    const subtotal = itemPrice * quantity;

                    return (
                      <tr key={index}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {item.image && (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="h-16 w-16 rounded object-cover"
                              />
                            )}
                            <div>
                              <div className="font-medium text-gray-900">{item.name}</div>
                              {item.productId && (
                                <div className="text-sm text-gray-500">ID: {item.productId}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">{quantity}</td>
                        <td className="px-4 py-4 text-right">{formatCurrency(itemPrice)}</td>
                        <td className="px-4 py-4 text-right font-medium">
                          {formatCurrency(subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-6 border-t pt-4">
              <div className="space-y-2 text-right">
                <div className="flex justify-end gap-4">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(Number(order.subtotal))}</span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-gray-600">Frakt:</span>
                  <span className="font-medium">
                    {order.shippingCost > 0 ? formatCurrency(Number(order.shippingCost)) : "Gratis"}
                  </span>
                </div>
                {order.tax > 0 && (
                  <div className="flex justify-end gap-4">
                    <span className="text-gray-600">MVA:</span>
                    <span className="font-medium">{formatCurrency(Number(order.tax))}</span>
                  </div>
                )}
                <div className="flex justify-end gap-4 border-t pt-2 text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(Number(order.total))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Betalingsinformasjon */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Betalingsinformasjon</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Betalingsmetode</label>
                <p className="mt-1 text-gray-900 capitalize">
                  {order.paymentMethod || "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Betalingsstatus</label>
                <div className="mt-1">{getPaymentStatusBadge(order.paymentStatus)}</div>
              </div>
              {order.paymentIntentId && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment Intent ID</label>
                  <p className="mt-1 font-mono text-sm text-gray-900 break-all">
                    {order.paymentIntentId}
                  </p>
                </div>
              )}
              {order.stripeSessionId && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Stripe Session ID</label>
                  <p className="mt-1 font-mono text-sm text-gray-900 break-all">
                    {order.stripeSessionId}
                  </p>
                </div>
              )}
              {order.customerEmail && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Kunde E-post</label>
                  <p className="mt-1 text-gray-900">{order.customerEmail}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar med admin handlinger */}
        <div className="lg:col-span-1">
          <OrderDetailsClient order={order} />
        </div>
      </div>
    </div>
  );
}

