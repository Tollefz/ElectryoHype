import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { safeQuery } from "@/lib/safeQuery";
import Link from "next/link";
import {
  normalizeOrderLineItems,
} from "@/lib/email-items";
import { PrintButton } from "@/components/admin/PrintButton";

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

const FULFILLMENT_LABELS: Record<string, string> = {
  NEW: "Ny",
  ORDERED_FROM_SUPPLIER: "Bestilt hos leverandør",
  SHIPPED: "Sendt",
  DELIVERED: "Fullført",
  CANCELLED: "Kansellert",
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Venter",
  paid: "Betalt",
  failed: "Feilet",
  refunded: "Refundert",
};

export default async function PackingSlipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    redirect("/admin/login");
  }

  const { id } = await params;
  const order = await safeQuery(
    () =>
      prisma.order.findUnique({
        where: { id },
        include: {
          customer: true,
          orderItems: { include: { product: true } },
        },
      }),
    null,
    "orders:print"
  );
  if (!order) notFound();

  const items = normalizeOrderLineItems({
    itemsJson: order.items,
    orderItems: order.orderItems,
  });

  let shipping: ShippingAddress = {};
  try {
    shipping =
      typeof order.shippingAddress === "string"
        ? (JSON.parse(order.shippingAddress) as ShippingAddress)
        : isRecord(order.shippingAddress)
          ? (order.shippingAddress as ShippingAddress)
          : {};
  } catch {
    shipping = {};
  }

  const noteSetting = await prisma.setting.findUnique({
    where: { key: `order_internal_notes:${order.id}` },
  });
  const notes =
    typeof noteSetting?.value === "string"
      ? noteSetting.value
      : order.internalNotes || "";

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:max-w-none print:p-0">
      <div className="mb-6 flex items-start justify-between print:hidden">
        <Link href={`/admin/orders/${order.id}`} className="text-sm text-green-700 hover:underline">
          ← Tilbake til ordre
        </Link>
        <PrintButton label="Skriv ut pakkseddel" />
      </div>

      <header className="mb-8 border-b border-black pb-4">
        <div className="flex justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pakkseddel</h1>
            <p className="text-sm">ElectroHypeX</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-lg font-bold">{order.orderNumber}</p>
            <p>{new Date(order.createdAt).toLocaleDateString("no-NO")}</p>
            <p>Betaling: {PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</p>
            <p>
              Status:{" "}
              {FULFILLMENT_LABELS[order.fulfillmentStatus || ""] || order.fulfillmentStatus}
            </p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="mb-1 font-bold uppercase tracking-wide">Kunde</h2>
          <p>{order.customer?.name || shipping.name || "—"}</p>
          <p>{order.customer?.email || order.customerEmail || "—"}</p>
        </div>
        <div>
          <h2 className="mb-1 font-bold uppercase tracking-wide">Leveringsadresse</h2>
          <p>{shipping.name || order.customer?.name || "—"}</p>
          <p>{shipping.address || shipping.address1 || "—"}</p>
          <p>
            {[shipping.zip || shipping.zipCode || shipping.postalCode, shipping.city]
              .filter(Boolean)
              .join(" ")}
          </p>
          <p>{shipping.country || "NO"}</p>
        </div>
      </section>

      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2">Produkt</th>
            <th className="py-2 w-16">Ant</th>
            <th className="py-2 w-24 text-right">Pris</th>
            <th className="py-2 w-28 text-right">Sum</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-300">
              <td className="py-2">
                {item.name}
                {item.variantName ? ` — ${item.variantName}` : ""}
              </td>
              <td className="py-2">{item.quantity || 1}</td>
              <td className="py-2 text-right">{formatCurrency(Number(item.price) || 0)}</td>
              <td className="py-2 text-right">
                {formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 ml-auto w-64 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(order.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Frakt</span>
          <span>{formatCurrency(order.shippingCost)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-base font-bold">
          <span>Totalt</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
      </div>

      {notes ? (
        <section className="mb-6 border border-black p-3 text-sm">
          <h2 className="mb-1 font-bold">Interne notater</h2>
          <p className="whitespace-pre-wrap">{notes}</p>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-black pt-4 text-xs text-gray-600">
        <p>Pakket av: _______________ &nbsp;&nbsp; Dato: _______________</p>
        <p className="mt-2">Sporing: {order.trackingNumber || "—"}</p>
      </footer>
    </div>
  );
}
