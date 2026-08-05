"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Mail,
  MoreHorizontal,
  Printer,
} from "lucide-react";
import {
  PaymentStatus,
  FulfillmentStatus,
  OrderStatus,
  EmailStatus,
} from "@prisma/client";
import { SUPPLIER_STATUS_LABELS } from "@/lib/order-labels";
import { formatDate } from "@/lib/format";
import {
  OrderStatusCard,
  CustomerCard,
  ShippingAddressCard,
  OrderProductsCard,
  TimelineCard,
  PaymentCard,
  ShippingCard,
  AIOrderActions,
  OrderCard,
} from "@/components/admin/orders";
import type { OrderProductLine } from "@/components/admin/orders/OrderProductsCard";
import type { TimelineEvent } from "@/components/admin/orders/TimelineCard";
import { OrderCleanupActions } from "@/app/admin/(panel)/orders/[id]/OrderCleanupActions";

type SupplierEvent = {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  createdAt: string;
};

export type OrderWorkspaceOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string | null;
  paymentIntentId?: string | null;
  stripeSessionId?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingCarrier?: string | null;
  supplierOrderStatus?: string | null;
  supplierOrderId?: string | null;
  autoOrderError?: string | null;
  customerEmailStatus?: EmailStatus;
  customerEmailLastError?: string | null;
  customerEmailSentAt?: string | null;
  customerEmail?: string | null;
  supplierEvents?: SupplierEvent[];
  createdAt: string;
  updatedAt: string;
  internalNotes?: string | null;
  notes?: string | null;
  isTestOrder: boolean;
  archivedAt?: string | null;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  customer?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  shippingAddress: {
    name?: string;
    address?: string;
    address2?: string;
    zip?: string;
    city?: string;
    country?: string;
  };
  productLines: OrderProductLine[];
};

export default function OrderDetailWorkspace({
  order: initial,
}: {
  order: OrderWorkspaceOrder;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notes, setNotes] = useState(initial.internalNotes || initial.notes || "");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>(
    initial.fulfillmentStatus || "NEW"
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    initial.paymentStatus
  );
  const [trackingNumber, setTrackingNumber] = useState(
    initial.trackingNumber || ""
  );
  const [trackingUrl, setTrackingUrl] = useState(initial.trackingUrl || "");
  const [shippingCarrier, setShippingCarrier] = useState(
    initial.shippingCarrier || ""
  );
  const [supplierStatus, setSupplierStatus] = useState(
    initial.supplierOrderStatus || "PENDING"
  );
  const [sendingSupplier, setSendingSupplier] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(true);

  useEffect(() => {
    setOrder(initial);
    setFulfillmentStatus(initial.fulfillmentStatus || "NEW");
    setPaymentStatus(initial.paymentStatus);
    setTrackingNumber(initial.trackingNumber || "");
    setTrackingUrl(initial.trackingUrl || "");
    setShippingCarrier(initial.shippingCarrier || "");
    setSupplierStatus(initial.supplierOrderStatus || "PENDING");
    setNotes(initial.internalNotes || initial.notes || "");
  }, [initial]);

  const timeline: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [
      {
        id: "created",
        title: "Ordre opprettet",
        at: formatDate(order.createdAt),
        source: "System",
      },
    ];
    if (order.paymentStatus === "paid") {
      events.push({
        id: "paid",
        title: "Betaling mottatt",
        at: formatDate(order.updatedAt),
        source: "Betaling",
      });
    }
    if (order.supplierOrderId) {
      events.push({
        id: "cj",
        title: "CJ bestilt",
        at: formatDate(order.updatedAt),
        source: "Leverandør",
      });
    }
    if (order.trackingNumber) {
      events.push({
        id: "track",
        title: "Tracking mottatt",
        at: formatDate(order.updatedAt),
        source: order.shippingCarrier || "Frakt",
      });
    }
    if (
      order.fulfillmentStatus === "SHIPPED" ||
      order.fulfillmentStatus === "DELIVERED"
    ) {
      events.push({
        id: "shipped",
        title: "Sendt",
        at: formatDate(order.updatedAt),
        source: "System",
      });
    }
    if (order.fulfillmentStatus === "DELIVERED") {
      events.push({
        id: "delivered",
        title: "Levert",
        at: formatDate(order.updatedAt),
        source: "System",
      });
    }
    for (const ev of order.supplierEvents || []) {
      events.push({
        id: ev.id,
        title: SUPPLIER_STATUS_LABELS[ev.newStatus] || ev.newStatus,
        at: new Date(ev.createdAt).toLocaleString("no-NO"),
        source: "Leverandør",
      });
    }
    return events;
  }, [order]);

  const patchOrder = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/admin/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Kunne ikke oppdatere ordre");
    }
    return response.json();
  };

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await patchOrder({
        fulfillmentStatus,
        paymentStatus,
        trackingNumber: trackingNumber.trim() || null,
        trackingUrl: trackingUrl.trim() || null,
        shippingCarrier: shippingCarrier.trim() || null,
        supplierOrderStatus: supplierStatus,
        notes: notes.trim() || null,
      });
      setOrder((prev) => ({ ...prev, ...updated }));
      if (
        trackingNumber.trim() &&
        trackingNumber.trim() !== order.trackingNumber
      ) {
        fetch(`/api/admin/orders/${order.id}/send-shipping-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackingNumber: trackingNumber.trim(),
            trackingUrl: trackingUrl.trim() || null,
          }),
        }).catch(() => undefined);
      }
      setSuccess("Ordre oppdatert!");
      router.refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      if (order.paymentStatus !== "paid") {
        await patchOrder({
          paymentStatus: "paid",
          fulfillmentStatus: "NEW",
        });
        setPaymentStatus("paid");
        setSuccess("Ordre bekreftet (betaling markert)");
      } else {
        await patchOrder({
          fulfillmentStatus: "ORDERED_FROM_SUPPLIER",
          paymentStatus: "paid",
        });
        setFulfillmentStatus("ORDERED_FROM_SUPPLIER");
        setSuccess("Ordre bekreftet — sendt til behandling");
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunne ikke bekrefte");
    } finally {
      setConfirming(false);
    }
  };

  const handleSendToSupplier = async () => {
    if (
      !confirm(
        "Registrere leverandør-ordre lokalt (stub)?\n\nIngen ekte leverandør kontaktes."
      )
    ) {
      return;
    }
    setSendingSupplier(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-to-supplier`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke registrere leverandør-ordre");
      }
      setSuccess("Leverandør-ordre registrert lokalt");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunne ikke registrere leverandør-ordre"
      );
    } finally {
      setSendingSupplier(false);
    }
  };

  const handleRetryEmail = async () => {
    const email = order.customer?.email || order.customerEmail;
    if (!email) {
      setError("Ingen e-postadresse registrert for kunden");
      return;
    }
    setRetryingEmail(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/retry-email`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || "Kunne ikke sende e-post");
      }
      setSuccess(data.message || "E-post sendt til kunde!");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunne ikke sende e-post");
    } finally {
      setRetryingEmail(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      router.refresh();
      setSuccess("Status synkronisert");
      setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSyncing(false);
    }
  };

  const createdLabel = formatDate(order.createdAt);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Tilbake til ordrer
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Ordre #{order.orderNumber.replace(/^#/, "")}
            </h1>
            {order.isTestOrder && (
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                Test
              </span>
            )}
            {order.archivedAt && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Arkiv
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            Bestilt: {createdLabel} · Kanal: Nettbutikk · Betaling:{" "}
            {order.paymentStatus === "paid" ? "Betalt" : "Ubetalt"}
          </p>
        </div>

        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 self-start">
          <Link
            href={`/admin/orders/${order.id}/print`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Printer size={16} />
            Skriv ut
          </Link>
          <button
            type="button"
            onClick={() => void handleRetryEmail()}
            disabled={retryingEmail}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Mail size={16} />
            {retryingEmail ? "Sender…" : "Send e-post"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Flere handlinger
              <ChevronDown size={16} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    setMoreOpen(false);
                    setActionsOpen(true);
                    document
                      .getElementById("ordre-behandling")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Rediger status
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    setMoreOpen(false);
                    void handleSendToSupplier();
                  }}
                >
                  Bestill hos CJ (stub)
                </button>
                <Link
                  href={`/admin/orders/${order.id}/print`}
                  target="_blank"
                  className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => setMoreOpen(false)}
                >
                  Pakkseddel
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left */}
        <div className="space-y-5 lg:col-span-3">
          <OrderStatusCard
            fulfillmentStatus={order.fulfillmentStatus}
            paymentStatus={order.paymentStatus}
            onConfirm={() => void handleConfirm()}
            confirming={confirming}
            moreActions={
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(true);
                  document
                    .getElementById("ordre-behandling")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Flere handlinger
                <MoreHorizontal size={16} />
              </button>
            }
          />
          <CustomerCard
            name={
              order.customer?.name ||
              order.shippingAddress.name ||
              null
            }
            email={order.customer?.email || order.customerEmail || null}
            phone={order.customer?.phone || null}
            customerId={order.customer?.id || null}
          />
          <ShippingAddressCard
            address={{
              name:
                order.shippingAddress.name ||
                order.customer?.name ||
                undefined,
              address: order.shippingAddress.address,
              address2: order.shippingAddress.address2,
              zip: order.shippingAddress.zip,
              city: order.shippingAddress.city,
              country: order.shippingAddress.country,
            }}
            onEditHint="Adresse redigeres via notater / fremtidig redigering"
          />
        </div>

        {/* Center */}
        <div className="space-y-5 lg:col-span-5">
          <OrderProductsCard
            items={order.productLines}
            summary={{
              subtotal: order.subtotal,
              shippingCost: order.shippingCost,
              tax: order.tax,
              total: order.total,
            }}
          />
          <div id="ordrehistorikk">
            <TimelineCard events={timeline} />
          </div>
        </div>

        {/* Right */}
        <div className="space-y-5 lg:col-span-4">
          <PaymentCard
            orderId={order.id}
            orderNumber={order.orderNumber}
            createdAtLabel={createdLabel}
            paymentMethod={order.paymentMethod}
            paymentStatus={order.paymentStatus}
            notes={notes || null}
          />
          <ShippingCard
            carrier={order.shippingCarrier || "CJ Dropshipping"}
            trackingNumber={order.trackingNumber}
            trackingUrl={order.trackingUrl}
            method="Standard"
            supplierOrderId={order.supplierOrderId}
            onSync={() => void handleSync()}
            syncing={syncing}
          />
          <AIOrderActions />
          <OrderCleanupActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            paymentStatus={order.paymentStatus}
            isTestOrder={order.isTestOrder}
            archivedAt={order.archivedAt ? new Date(order.archivedAt) : null}
          />
        </div>
      </div>

      {/* Full treatment panel — same functionality as before */}
      <div id="ordre-behandling">
        <OrderCard
          title="Behandling"
          action={
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              {actionsOpen ? "Skjul" : "Vis"}
            </button>
          }
        >
          {actionsOpen ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Oppfyllelsesstatus
                </label>
                <select
                  value={fulfillmentStatus}
                  onChange={(e) =>
                    setFulfillmentStatus(e.target.value as FulfillmentStatus)
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="NEW">Ny</option>
                  <option value="ORDERED_FROM_SUPPLIER">Bestilt hos leverandør</option>
                  <option value="SHIPPED">Sendt</option>
                  <option value="DELIVERED">Levert</option>
                  <option value="CANCELLED">Kansellert</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Betalingsstatus
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(e.target.value as PaymentStatus)
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="pending">Ubetalt</option>
                  <option value="paid">Betalt</option>
                  <option value="failed">Feilet</option>
                  <option value="refunded">Refundert</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Leverandørstatus
                </label>
                <select
                  value={supplierStatus}
                  onChange={(e) => setSupplierStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {Object.entries(SUPPLIER_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Sporingsnummer
                </label>
                <input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="ABC123…"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Sporings-URL
                </label>
                <input
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Fraktfører
                </label>
                <input
                  value={shippingCarrier}
                  onChange={(e) => setShippingCarrier(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="CJ / Bring / DHL"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Interne notater
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleUpdate()}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? "Oppdaterer…" : "Oppdater ordre"}
                </button>
                <button
                  type="button"
                  disabled={sendingSupplier}
                  onClick={() => void handleSendToSupplier()}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {sendingSupplier ? "Registrerer…" : "Bestill hos CJ (stub)"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Status, tracking og notater er skjult. Trykk Vis for å redigere.
            </p>
          )}
        </OrderCard>
      </div>
    </div>
  );
}
