"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PaymentStatus, FulfillmentStatus, OrderStatus, EmailStatus } from "@prisma/client";
import { SUPPLIER_STATUS_LABELS } from "@/lib/order-labels";

interface SupplierEvent {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  createdAt: string;
}

interface OrderDetails {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingCarrier?: string | null;
  paymentMethod?: string | null;
  paymentIntentId?: string | null;
  supplierOrderStatus?: string | null;
  supplierOrderId?: string | null;
  autoOrderError?: string | null;
  customerEmailStatus?: EmailStatus;
  customerEmailLastError?: string | null;
  customerEmailSentAt?: Date | string | null;
  supplierEvents?: SupplierEvent[];
  createdAt: Date | string;
  updatedAt: Date | string;
  internalNotes?: string | null;
  notes?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

interface OrderDetailsClientProps {
  order: OrderDetails;
}

export default function OrderDetailsClient({ order: initialOrder }: OrderDetailsClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetails>(initialOrder);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialOrder.internalNotes || initialOrder.notes || "");

  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>(
    order.fulfillmentStatus || "NEW"
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || "");
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl || "");
  const [shippingCarrier, setShippingCarrier] = useState(order.shippingCarrier || "");
  const [supplierStatus, setSupplierStatus] = useState(order.supplierOrderStatus || "PENDING");
  const [sendingSupplier, setSendingSupplier] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);

  useEffect(() => {
    setFulfillmentStatus(order.fulfillmentStatus || "NEW");
    setPaymentStatus(order.paymentStatus);
    setTrackingNumber(order.trackingNumber || "");
    setTrackingUrl(order.trackingUrl || "");
    setSupplierStatus(order.supplierOrderStatus || "PENDING");
  }, [order]);

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fulfillmentStatus, // Single source of truth
          paymentStatus,
          trackingNumber: trackingNumber.trim() || null,
          trackingUrl: trackingUrl.trim() || null,
          shippingCarrier: shippingCarrier.trim() || null,
          supplierOrderStatus: supplierStatus, // Internal note only
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Kunne ikke oppdatere ordre");
      }

      const updatedOrder = await response.json();
      setOrder(updatedOrder);
      
      // Hvis tracking nummer ble lagt til og det ikke var der før, send shipping notifikasjon
      if (trackingNumber.trim() && trackingNumber.trim() !== order.trackingNumber) {
        // Send shipping notification (fire and forget)
        fetch(`/api/admin/orders/${order.id}/send-shipping-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackingNumber: trackingNumber.trim(),
            trackingUrl: trackingUrl.trim() || null,
          }),
        }).catch((err) => console.error("Failed to send shipping notification:", err));
      }
      
      setSuccess("Ordre oppdatert!");
      router.refresh();

      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  };

  const handleSendToSupplier = async () => {
    if (
      !confirm(
        "Registrere leverandør-ordre lokalt (stub)?\n\nDette kjører mock-adapteren: ingen ekte leverandør kontaktes, ingen e-post sendes, og ingen penger brukes. Databasen får et lokalt supplierOrderId (f.eks. TEMU-…). Kan kjøres flere ganger og overskriver forrige ID."
      )
    ) {
      return;
    }
    setSendingSupplier(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-to-supplier`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke registrere leverandør-ordre");
      }
      setSuccess("Leverandør-ordre registrert lokalt (stub — ingen ekstern kontakt)");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunne ikke registrere leverandør-ordre");
    } finally {
      setSendingSupplier(false);
    }
  };

  const handleRetryEmail = async () => {
    if (!order.customer?.email) {
      setError("Ingen e-postadresse registrert for kunden");
      return;
    }

    setRetryingEmail(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${order.id}/retry-email`, {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) {
        const hint =
          data.diagnostics?.apiKeyDetected === false
            ? " Sett RESEND_API_KEY i .env og restart serveren."
            : "";
        throw new Error((data.error || data.message || "Kunne ikke sende e-post") + hint);
      }

      setSuccess(data.message || "E-post sendt til kunde!");
      if (data.diagnostics?.finalDatabaseStatus) {
        setOrder((prev) => ({
          ...prev,
          customerEmailStatus: data.diagnostics.finalDatabaseStatus,
          customerEmailLastError: null,
          customerEmailSentAt: new Date(),
        }));
      }
      router.refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunne ikke sende e-post");
      router.refresh();
    } finally {
      setRetryingEmail(false);
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("no-NO", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Admin handlinger */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Behandling</h2>
        <p className="mb-4 text-sm text-gray-500">Oppdater status, sporingsinfo og e-post</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            {success}
          </div>
        )}

        <div className="space-y-4">
          {/* Fulfillment Status - Single source of truth */}
          <div>
            <label htmlFor="fulfillmentStatus" className="block text-sm font-medium text-gray-700 mb-1">
              Oppfyllelsesstatus
            </label>
            <select
              id="fulfillmentStatus"
              value={fulfillmentStatus}
              onChange={(e) => setFulfillmentStatus(e.target.value as FulfillmentStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="NEW">NY</option>
              <option value="ORDERED_FROM_SUPPLIER">Bestilt hos leverandør</option>
              <option value="SHIPPED">Sendt</option>
              <option value="DELIVERED">Fullført</option>
              <option value="CANCELLED">Kansellert</option>
            </select>
          </div>

          {/* Quick action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setFulfillmentStatus("ORDERED_FROM_SUPPLIER")}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Marker som bestilt
            </button>
            <button
              onClick={() => setFulfillmentStatus("SHIPPED")}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              Marker som sendt
            </button>
            <button
              onClick={() => setFulfillmentStatus("DELIVERED")}
              className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
            >
              Marker som fullført
            </button>
            <button
              onClick={() => setFulfillmentStatus("CANCELLED")}
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Avbryt ordre
            </button>
          </div>

          {/* Betalingsstatus */}
          <div>
            <label htmlFor="paymentStatus" className="block text-sm font-medium text-gray-700 mb-1">
              Betalingsstatus
            </label>
            <select
              id="paymentStatus"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="pending">Venter</option>
              <option value="paid">Betalt</option>
              <option value="failed">Feilet</option>
              <option value="refunded">Refundert</option>
            </select>
          </div>

          {/* Leverandørstatus */}
          <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Leverandør</p>
                  <p className="text-sm text-gray-600">
                    {SUPPLIER_STATUS_LABELS[order.supplierOrderStatus || "PENDING"] ||
                      order.supplierOrderStatus ||
                      "Venter"}
                    {order.supplierOrderId ? ` · ${order.supplierOrderId}` : ""}
                  </p>
                  {order.autoOrderError && (
                    <p className="mt-1 text-xs text-red-600">Feil: {order.autoOrderError}</p>
                  )}
                </div>
                <button
                  onClick={handleSendToSupplier}
                  disabled={sendingSupplier}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingSupplier ? "Registrerer…" : "Registrer leverandør-ordre (stub)"}
                </button>
              </div>
              <div>
                <label htmlFor="supplierStatus" className="mb-1 block text-sm font-medium text-gray-700">
                  Sett leverandørstatus
                </label>
                <select
                  id="supplierStatus"
                  value={supplierStatus}
                  onChange={(e) => setSupplierStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  {Object.entries(SUPPLIER_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tracking nummer */}
          <div>
            <label htmlFor="trackingNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Sporingsnummer
            </label>
            <input
              id="trackingNumber"
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Eks: ABC123456789"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Tracking URL */}
          <div>
            <label htmlFor="trackingUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Sporings-URL
            </label>
            <input
              id="trackingUrl"
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://tracking.example.com/..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Shipping carrier */}
          <div>
            <label htmlFor="shippingCarrier" className="block text-sm font-medium text-gray-700 mb-1">
              Fraktfører (valgfritt)
            </label>
            <input
              id="shippingCarrier"
              type="text"
              value={shippingCarrier}
              onChange={(e) => setShippingCarrier(e.target.value)}
              placeholder="PostNord / Bring / DHL"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Notater */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Interne notater
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Legg til interne notater om ordren..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Email Status */}
          {order.customer?.email && (
            <div className="rounded-lg border border-gray-200 p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  E-post status
                </label>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                  order.customerEmailStatus === "SENT" 
                    ? "bg-green-100 text-green-800"
                    : order.customerEmailStatus === "FAILED"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}>
                  {order.customerEmailStatus === "SENT" 
                    ? "✓ Sendt"
                    : order.customerEmailStatus === "FAILED"
                    ? "✗ Feilet"
                    : "Ikke sendt"}
                </span>
              </div>
              {order.customerEmailSentAt && (
                <p className="text-xs text-gray-600 mb-1">
                  Sendt: {formatDate(order.customerEmailSentAt)}
                </p>
              )}
              {order.customerEmailLastError && (
                <p className="text-xs text-red-600 mb-2 break-words">
                  Feil: {order.customerEmailLastError}
                </p>
              )}
              <button
                onClick={handleRetryEmail}
                disabled={retryingEmail}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {retryingEmail ? "Sender..." : "Send ordrebekreftelse på nytt"}
              </button>
            </div>
          )}

          {/* Knapper */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleUpdate}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? "Oppdaterer..." : "Oppdater ordre"}
            </button>
          </div>
        </div>
      </div>

      {/* Leverandørhistorikk */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Leverandørhistorikk</h2>
        {order.supplierEvents && order.supplierEvents.length > 0 ? (
          <div className="space-y-4">
            {order.supplierEvents.map((ev) => (
              <div key={ev.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                  <div className="h-full w-0.5 bg-gray-200"></div>
                </div>
                <div className="flex-1 pb-4">
                  <div className="font-medium text-gray-900">
                    {SUPPLIER_STATUS_LABELS[ev.newStatus] || ev.newStatus}
                  </div>
                  {ev.oldStatus && (
                    <div className="text-xs text-gray-500">
                      Fra: {SUPPLIER_STATUS_LABELS[ev.oldStatus] || ev.oldStatus}
                    </div>
                  )}
                  <div className="text-sm text-gray-500">
                    {new Date(ev.createdAt).toLocaleString("no-NO")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">Ingen leverandørhendelser ennå.</p>
        )}
      </div>

      {/* Tidslinje */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Tidslinje</h2>
        <div className="space-y-4">
          {/* Ordre opprettet */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="h-3 w-3 rounded-full bg-blue-500"></div>
              <div className="h-full w-0.5 bg-gray-200"></div>
            </div>
            <div className="flex-1 pb-4">
              <div className="font-medium text-gray-900">Ordre opprettet</div>
              <div className="text-sm text-gray-500">{formatDate(order.createdAt)}</div>
            </div>
          </div>

          {/* Betaling */}
          {order.paymentStatus === "paid" && (
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                {order.status !== "delivered" && <div className="h-full w-0.5 bg-gray-200"></div>}
              </div>
              <div className="flex-1 pb-4">
                <div className="font-medium text-gray-900">Betaling mottatt</div>
                <div className="text-sm text-gray-500">{formatDate(order.updatedAt)}</div>
              </div>
            </div>
          )}

          {/* Status endringer */}
          {order.status !== "pending" && (
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-3 w-3 rounded-full bg-indigo-500"></div>
                {!order.trackingNumber && <div className="h-full w-0.5 bg-gray-200"></div>}
              </div>
              <div className="flex-1 pb-4">
                <div className="font-medium text-gray-900">Status endret til: {order.status}</div>
                <div className="text-sm text-gray-500">{formatDate(order.updatedAt)}</div>
              </div>
            </div>
          )}

          {/* Tracking */}
          {order.trackingNumber && (
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-3 w-3 rounded-full bg-purple-500"></div>
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">Sporingsnummer lagt til</div>
                <div className="text-sm text-gray-500">{formatDate(order.updatedAt)}</div>
                <div className="mt-1 text-sm font-mono text-blue-600">{order.trackingNumber}</div>
                {order.trackingUrl && (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 text-sm text-blue-600 hover:underline"
                  >
                    Spor ordre →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print knapp */}
      <div className="rounded-xl bg-white p-6 shadow-sm print:hidden">
        <Link
          href={`/admin/orders/${order.id}/print`}
          target="_blank"
          className="mb-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Pakkseddel (utskrift)
        </Link>
        <button
          onClick={() => window.print()}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Skriv ut ordre
        </button>
      </div>
    </div>
  );
}
