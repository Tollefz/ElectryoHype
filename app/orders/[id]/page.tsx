"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SupplierOrderStatus =
  | "PENDING"
  | "SENT_TO_SUPPLIER"
  | "ACCEPTED_BY_SUPPLIER"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | string;

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product?: { name: string };
  variantName?: string | null;
}

interface SupplierEvent {
  id: string;
  oldStatus: SupplierOrderStatus | null;
  newStatus: SupplierOrderStatus;
  createdAt: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  supplierOrderStatus?: SupplierOrderStatus | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingCarrier?: string | null;
  createdAt: string;
  orderItems: OrderItem[];
}

function humanSupplierStatus(status?: SupplierOrderStatus | null) {
  const map: Record<string, string> = {
    PENDING: "Venter hos leverandør",
    SENT_TO_SUPPLIER: "Sendt til leverandør",
    ACCEPTED_BY_SUPPLIER: "Godkjent av leverandør",
    SHIPPED: "Sendt",
    DELIVERED: "Levert",
    CANCELLED: "Kansellert",
  };
  if (!status) return "Venter hos leverandør";
  return map[status] || status;
}

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<SupplierEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const orderRes = await fetch(`/api/orders/${id}`);
        if (orderRes.ok) {
          const data = await orderRes.json();
          setOrder(data);
        }
        const evRes = await fetch(`/api/orders/${id}/tracking-events`);
        if (evRes.ok) {
          const evData = await evRes.json();
          setEvents(evData.events || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Laster ordre...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-xl font-semibold">Fant ikke ordre</p>
          <Link href="/" className="text-blue-600 underline">
            Til forsiden
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl px-4 space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm text-gray-500">Ordrenummer</p>
              <p className="text-2xl font-bold text-gray-900">{order.orderNumber}</p>
              <p className="text-sm text-gray-500">Opprettet: {new Date(order.createdAt).toLocaleString("no-NO")}</p>
            </div>
            <div className="text-right space-y-1">
              <span className="inline-flex rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-sm font-semibold">
                Betaling: {order.paymentStatus}
              </span>
              <div>
                <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-sm font-semibold">
                  Leverandør: {humanSupplierStatus(order.supplierOrderStatus)}
                </span>
              </div>
            </div>
          </div>

          {/* Tracking */}
          {(order.trackingNumber || order.trackingUrl) && (
            <div className="rounded-lg border bg-gray-50 p-4 mb-4">
              <h3 className="font-semibold text-gray-800 mb-1">Sporing</h3>
              {order.shippingCarrier && (
                <p className="text-sm text-gray-700">Fraktfører: {order.shippingCarrier}</p>
              )}
              {order.trackingNumber && (
                <p className="text-sm text-gray-700">Sporingsnummer: {order.trackingNumber}</p>
              )}
              {order.trackingUrl && (
                <Link
                  href={order.trackingUrl}
                  target="_blank"
                  className="inline-flex mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Spor pakken
                </Link>
              )}
            </div>
          )}

          {/* Products */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-800">Produkter</h3>
            <div className="divide-y border rounded-lg bg-white">
              {order.orderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.product?.name || item.variantName || "Produkt"}</p>
                    <p className="text-sm text-gray-600">Antall: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {(item.price * item.quantity).toFixed(0)} kr
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline / events */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Statushistorikk</h3>
          {events.length === 0 ? (
            <p className="text-sm text-gray-600">Ingen leverandørhendelser ennå.</p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {humanSupplierStatus(ev.newStatus)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(ev.createdAt).toLocaleString("no-NO")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

