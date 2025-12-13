"use client";

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Package, Mail, ArrowRight } from 'lucide-react';
import { useCart } from '@/lib/cart-context';

interface Order {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    email: string;
  };
  items: any[];
  total: number;
  shippingAddress: any;
  createdAt: string;
  paymentStatus?: string;
  supplierOrderStatus?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}

export default function OrderConfirmationClient() {
  const searchParams = useSearchParams();
  const paymentIntentId = searchParams.get('payment_intent');
  const sessionId = searchParams.get('session_id');
  const redirectStatus = searchParams.get('redirect_status');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailSent, setEmailSent] = useState(false);
  const { clearCart } = useCart();

  useEffect(() => {
    const fetchOrder = async () => {
      // Try session_id first (Stripe Checkout Session), then payment_intent (Payment Intent)
      if (!sessionId && !paymentIntentId) {
        setLoading(false);
        return;
      }

      try {
        let response;
        if (sessionId) {
          // Fetch order by Stripe session ID
          response = await fetch(`/api/orders/by-session?sessionId=${sessionId}`);
        } else if (paymentIntentId) {
          // Fallback to payment intent
          response = await fetch(`/api/orders/by-payment-intent?paymentIntentId=${paymentIntentId}`);
        }

        if (response && response.ok) {
          const data = await response.json();
          setOrder(data);

          // Tøm handlekurv
          clearCart();

          // Hvis betalingen var vellykket, oppdater ordre status og send e-post
          if (redirectStatus === 'succeeded' && data.id) {
            const needsUpdate = data.paymentStatus !== 'paid';

            if (needsUpdate) {
              // Oppdater status først
              try {
                await fetch(`/api/admin/orders/${data.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    paymentStatus: 'paid',
                    status: 'processing',
                  }),
                });

                // Send e-post etter at status er oppdatert
                await fetch(`/api/admin/orders/${data.id}/send-email`, {
                  method: 'POST',
                });

                setEmailSent(true);
                console.log('✅ Ordre oppdatert og e-post bekreftelse sendt');
              } catch (err) {
                console.error('❌ Kunne ikke oppdatere ordre eller sende e-post:', err);
              }
            } else {
              // Status er allerede paid, prøv å sende e-post allikevel (webhook kan ha feilet)
              try {
                await fetch(`/api/admin/orders/${data.id}/send-email`, {
                  method: 'POST',
                });
                setEmailSent(true);
                console.log('✅ E-post bekreftelse sendt');
              } catch (err) {
                console.error('❌ Kunne ikke sende e-post:', err);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [paymentIntentId, redirectStatus, clearCart]);

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
          <p className="mb-8 text-gray-300">Vi kunne ikke finne din ordre. Kontakt oss hvis du trenger hjelp.</p>
          <Link href="/" className="inline-block rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700">
            Tilbake til forsiden
          </Link>
        </div>
      </div>
    );
  }

  const mapSupplierStatus = (status?: string) => {
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
  };

  let items = [];
  let shippingAddress = {};

  try {
    if (typeof order.items === 'string') {
      items = JSON.parse(order.items);
    } else if (Array.isArray(order.items)) {
      items = order.items;
    }

    if (typeof order.shippingAddress === 'string') {
      shippingAddress = JSON.parse(order.shippingAddress);
    } else if (order.shippingAddress) {
      shippingAddress = order.shippingAddress;
    }
  } catch (error) {
    console.error('Error parsing order data:', error);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 py-12">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          {/* Success Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="mb-2 text-4xl font-bold text-white">Takk for din bestilling! 🎉</h1>
            <p className="text-lg text-gray-300">
              Din ordre er mottatt og bekreftet. Vi sender deg en e-post med ordredetaljer.
            </p>
            {order.supplierOrderStatus && (
              <p className="mt-2 text-sm text-gray-300">
                Leverandørstatus: {mapSupplierStatus(order.supplierOrderStatus)}
              </p>
            )}
            {emailSent && (
              <div className="mt-4 inline-block rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
                ✓ E-post bekreftelse er sendt
              </div>
            )}
          </div>

          {/* Order Info Card */}
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

            {/* Customer Info */}
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-white">Kundeinformasjon</h2>
              <div className="rounded-lg bg-gray-800 border border-green-600/10 p-4">
                <p className="font-medium text-white">{order.customer.name}</p>
                <p className="text-sm text-gray-300">{order.customer.email}</p>
              </div>
            </div>

            {/* Shipping Address */}
            {shippingAddress && (shippingAddress as any).name && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">Leveringsadresse</h2>
                <div className="rounded-lg bg-gray-800 border border-green-600/10 p-4">
                  <p className="font-medium text-white">{(shippingAddress as any).name}</p>
                  <p className="text-sm text-gray-300">{(shippingAddress as any).address}</p>
                  <p className="text-sm text-gray-300">
                    {(shippingAddress as any).zip} {(shippingAddress as any).city}
                  </p>
                </div>
              </div>
            )}

            {/* Products */}
            {items.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">Produkter</h2>
                <div className="space-y-3">
                  {items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between rounded-lg bg-gray-800 border border-green-600/10 p-4">
                      <div>
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-sm text-gray-300">Antall: {item.quantity}</p>
                      </div>
                      <p className="font-medium text-white">{(item.price * item.quantity).toFixed(0)} kr</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-green-600/20 pt-4">
              <div className="flex justify-between text-2xl font-bold text-white">
                <span>Total</span>
                <span>{order.total.toFixed(0)} kr</span>
              </div>
            </div>

            {/* Tracking */}
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

          {/* Manual Fulfillment Disclosure */}
          <div className="mb-6 rounded-lg bg-blue-900/30 border border-blue-500/30 p-4">
            <h3 className="text-sm font-semibold text-blue-200 mb-2">Viktig informasjon</h3>
            <p className="text-xs text-blue-100">
              Din ordre blir behandlet <strong>manuelt</strong> av ElectroHypeX. Vi sender deg sporingsinformasjon så snart pakken er sendt. 
              Forventet leveringstid: <strong>5-12 virkedager</strong> fra ordrebehandling.
            </p>
          </div>

          {/* Next Steps */}
          <div className="mb-8 rounded-2xl bg-gray-900 border border-green-600/20 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Hva skjer nå?</h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">1. Du mottar ordrebekreftelse</h3>
                  <p className="text-sm text-gray-300">
                    En e-post med alle detaljer er sendt til {order.customer.email}
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">2. Vi behandler din ordre manuelt</h3>
                  <p className="text-sm text-gray-300">Ordren din blir behandlet og pakket av vårt team</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <ArrowRight size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">3. Pakken sendes</h3>
                  <p className="text-sm text-gray-300">
                    Du får sporingsinformasjon når pakken er sendt (estimert 5-12 virkedager)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/"
              className="flex-1 rounded-lg border-2 border-green-600 bg-green-600 px-6 py-3 text-center font-medium text-white hover:bg-green-700"
            >
              Fortsett å handle
            </Link>
            <Link
              href="/products"
              className="flex-1 rounded-lg border-2 border-green-600 bg-transparent px-6 py-3 text-center font-medium text-white hover:bg-green-600/10"
            >
              Se alle produkter
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

