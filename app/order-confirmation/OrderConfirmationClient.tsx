"use client";

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Package, Mail, ArrowRight } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { TrackPurchaseOnce } from '@/components/analytics/TrackEvents';
import type { AnalyticsItem } from '@/lib/analytics/ecommerce';

interface OrderItem {
  name?: string;
  title?: string;
  productName?: string;
  quantity?: number;
  price?: number;
  image?: string;
}

interface ShippingAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  postal_code?: string;
  postalCode?: string;
  country?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customer: {
    name: string | null;
    email: string | null;
  } | null;
  items: OrderItem[] | string;
  total: number;
  shippingAddress: ShippingAddress | string | null;
  createdAt: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  customerEmailStatus?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOrderItems(raw: unknown): OrderItem[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item): OrderItem => {
    if (!isRecord(item)) return {};
    return {
      name: typeof item.name === 'string' ? item.name : undefined,
      title: typeof item.title === 'string' ? item.title : undefined,
      productName: typeof item.productName === 'string' ? item.productName : undefined,
      quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
      price: typeof item.price === 'number' ? item.price : undefined,
      image: typeof item.image === 'string' ? item.image : undefined,
    };
  });
}

function parseShippingAddress(raw: unknown): ShippingAddress {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!isRecord(parsed)) return {};
  return {
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    line1: typeof parsed.line1 === 'string' ? parsed.line1 : undefined,
    line2: typeof parsed.line2 === 'string' ? parsed.line2 : undefined,
    city: typeof parsed.city === 'string' ? parsed.city : undefined,
    postal_code: typeof parsed.postal_code === 'string' ? parsed.postal_code : undefined,
    postalCode: typeof parsed.postalCode === 'string' ? parsed.postalCode : undefined,
    country: typeof parsed.country === 'string' ? parsed.country : undefined,
  };
}

export default function OrderConfirmationClient() {
  const searchParams = useSearchParams();
  const paymentIntentId = searchParams.get('payment_intent');
  const sessionId = searchParams.get('session_id');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const { clearCart } = useCart();

  useEffect(() => {
    const fetchOrder = async () => {
      if (!sessionId && !paymentIntentId) {
        setLoading(false);
        return;
      }

      try {
        let response: Response | undefined;
        if (sessionId) {
          response = await fetch(`/api/orders/by-session?sessionId=${encodeURIComponent(sessionId)}`);
        } else if (paymentIntentId) {
          response = await fetch(
            `/api/orders/by-payment-intent?paymentIntentId=${encodeURIComponent(paymentIntentId)}`
          );
        }

        if (response && response.ok) {
          const data = await response.json();
          setOrder(data);
          // Cart clear only after we confirmed the order exists
          clearCart();
        }
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [paymentIntentId, sessionId, clearCart]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
          <p className="mt-4 text-lg text-slate-600">Behandler din ordre...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="mb-4 text-3xl font-bold text-white">Ordre ikke funnet</h1>
          <p className="mb-8 text-gray-300">
            Betalingen kan fortsatt behandles. Sjekk e-posten din om noen minutter, eller kontakt
            kundeservice med kvitteringen fra Stripe.
          </p>
          <Link href="/kundeservice" className="inline-block rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700 mr-3">
            Kundeservice
          </Link>
          <Link href="/" className="inline-block rounded-lg border border-green-600 px-6 py-3 text-white hover:bg-green-700/20">
            Til forsiden
          </Link>
        </div>
      </div>
    );
  }

  let items: OrderItem[] = [];
  let shippingAddress: ShippingAddress = {};

  try {
    items = parseOrderItems(order.items);
    shippingAddress = parseShippingAddress(order.shippingAddress);
  } catch (error) {
    console.error('Error parsing order data:', error);
  }

  const customerEmail = order.customer?.email || null;
  const customerName = order.customer?.name || shippingAddress?.name || 'Kunde';

  const purchaseItems: AnalyticsItem[] = items.map((item, index) => ({
    item_id: String(
      (item as OrderItem & { productId?: string }).productId ||
        item.name ||
        item.title ||
        `line-${index}`
    ),
    item_name: item.name || item.title || item.productName || 'Produkt',
    item_brand: 'ElectroHypeX',
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 1),
    index,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 py-12">
      <TrackPurchaseOnce
        transactionId={order.orderNumber}
        value={Number(order.total) || 0}
        items={purchaseItems}
      />
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="mb-2 text-4xl font-bold text-white">Takk for din bestilling!</h1>
            <p className="text-lg text-gray-300">
              Din ordre er mottatt. Vi behandler den manuelt og sender sporingsinfo når pakken er sendt.
            </p>
            {order.paymentStatus === 'paid' && (
              <div className="mt-4 inline-block rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
                Betaling bekreftet
              </div>
            )}
          </div>

          <div className="mb-6 rounded-2xl bg-gray-900 border border-green-600/20 p-8 shadow-lg">
            <div className="mb-6 flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-sm text-gray-400">Ordrenummer</p>
                <p className="text-2xl font-bold text-white">{order.orderNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Dato</p>
                <p className="font-medium text-white">{new Date(order.createdAt).toLocaleDateString('no-NO')}</p>
              </div>
            </div>

            {(customerName || customerEmail) && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">Kundeinformasjon</h2>
                <div className="rounded-lg bg-gray-800 border border-green-600/10 p-4">
                  {customerName && <p className="font-medium text-white">{customerName}</p>}
                  {customerEmail && <p className="text-sm text-gray-300">{customerEmail}</p>}
                </div>
              </div>
            )}

            {shippingAddress && (shippingAddress.city || shippingAddress.name) && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">Levering</h2>
                <div className="rounded-lg bg-gray-800 border border-green-600/10 p-4">
                  {shippingAddress.name && <p className="font-medium text-white">{shippingAddress.name}</p>}
                  <p className="text-sm text-gray-300">
                    {[shippingAddress.postalCode, shippingAddress.city].filter(Boolean).join(' ')}
                    {shippingAddress.country ? `, ${shippingAddress.country}` : ''}
                  </p>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">Produkter</h2>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex justify-between rounded-lg bg-gray-800 border border-green-600/10 p-4">
                      <div>
                        <p className="font-medium text-white">{item.name || item.productName || 'Produkt'}</p>
                        <p className="text-sm text-gray-300">Antall: {item.quantity}</p>
                      </div>
                      <p className="font-medium text-white">
                        {((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(0)} kr
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-green-600/20 pt-4">
              <div className="flex justify-between text-2xl font-bold text-white">
                <span>Total</span>
                <span>{Number(order.total || 0).toFixed(0)} kr</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">Inkl. mva</p>
            </div>

            {(order.trackingNumber || order.trackingUrl) && (
              <div className="mt-6 rounded-lg bg-gray-800 border border-green-600/10 p-4">
                <h3 className="mb-2 text-lg font-semibold text-white">Sporing</h3>
                {order.trackingNumber && (
                  <p className="text-gray-200 text-sm mb-2">Sporingsnummer: {order.trackingNumber}</p>
                )}
                {order.trackingUrl && (
                  <Link
                    href={order.trackingUrl}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Spor pakken <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="mb-6 rounded-lg bg-blue-900/30 border border-blue-500/30 p-4">
            <h3 className="text-sm font-semibold text-blue-200 mb-2">Viktig informasjon</h3>
            <p className="text-xs text-blue-100">
              Din ordre blir behandlet manuelt av ElectroHypeX. Forventet leveringstid:
              <strong> 5–12 virkedager</strong> etter ordrebehandling.
            </p>
          </div>

          <div className="mb-8 rounded-2xl bg-gray-900 border border-green-600/20 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Hva skjer nå?</h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">1. Ordrebekreftelse på e-post</h3>
                  <p className="text-sm text-gray-300">
                    {customerEmail
                      ? `Vi sender detaljer til ${customerEmail} (sjekk også søppelpost).`
                      : 'Sjekk e-posten du oppga i kassen.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">2. Manuell behandling</h3>
                  <p className="text-sm text-gray-300">Ordren pakkes og sendes av vårt team</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <ArrowRight size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">3. Sporing når sendt</h3>
                  <p className="text-sm text-gray-300">Du får sporingsinfo når pakken er på vei</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 rounded-lg border-2 border-white/40 bg-transparent px-6 py-3 text-center font-medium text-white hover:bg-white/10 print:hidden"
            >
              Skriv ut / lagre kvittering
            </button>
            <Link
              href="/"
              className="flex-1 rounded-lg border-2 border-green-600 bg-green-600 px-6 py-3 text-center font-medium text-white hover:bg-green-700"
            >
              Fortsett å handle
            </Link>
            <Link
              href="/products"
              className="flex-1 rounded-lg border-2 border-green-600 bg-transparent px-6 py-3 text-center font-medium text-white hover:bg-green-600/10 print:hidden"
            >
              Se alle produkter
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-gray-400 print:hidden">
            Ta vare på ordrenummeret — du trenger det ved retur eller kundeservice.
          </p>
        </div>
      </div>
    </div>
  );
}
