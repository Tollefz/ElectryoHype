import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SupplierOrderStatus } from "@prisma/client";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { safeQuery } from "@/lib/safeQuery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function humanStatus(status: SupplierOrderStatus | null) {
  if (!status) return "PENDING";
  return status;
}

export default async function SupportOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ supplierStatus?: string; errorOnly?: string; minTotal?: string }> | { supplierStatus?: string; errorOnly?: string; minTotal?: string };
}) {
  const storeId = await getStoreIdFromHeadersServer();
  
  // Safely parse searchParams - handle both Promise and object
  const params = searchParams instanceof Promise ? await searchParams : searchParams || {};
  const supplierStatus = params?.supplierStatus ?? "";
  const errorOnly = params?.errorOnly === "true";
  const minTotal = params?.minTotal ? Number(params.minTotal) : 0;

  const orders = await safeQuery(
    () =>
      prisma.order.findMany({
        where: {
          storeId,
          ...(supplierStatus ? { supplierOrderStatus: supplierStatus as SupplierOrderStatus } : {}),
          ...(errorOnly ? { autoOrderError: { not: null } } : {}),
          ...(minTotal > 0 ? { total: { gte: minTotal } } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          customer: true,
          supplierEvents: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        take: 50,
      }),
    [],
    "orders:support"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Supportkonsoll</h1>
        <div className="text-sm text-gray-600">Viser siste {orders.length} ordre</div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Filtre</h2>
        <div className="flex gap-3 text-sm text-blue-600 flex-wrap">
          <Link href="/admin/support/orders">Nullstill</Link>
          <Link href="/admin/support/orders?supplierStatus=SENT_TO_SUPPLIER">Sent til leverandør</Link>
          <Link href="/admin/support/orders?supplierStatus=SHIPPED">Sendt</Link>
          <Link href="/admin/support/orders?errorOnly=true">Kun med feil</Link>
          <Link href="/admin/support/orders?minTotal=2000">Høy verdi (&ge; 2000)</Link>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm divide-y">
        <div className="grid grid-cols-6 gap-2 px-4 py-3 text-xs font-semibold text-gray-600">
          <span>Ordre</span>
          <span>Kunde</span>
          <span>Total</span>
          <span>Leverandørstatus</span>
          <span>Feil</span>
          <span>Handlinger</span>
        </div>
        {orders.length === 0 && (
          <div className="px-4 py-6 text-sm text-gray-600">Ingen ordre å vise akkurat nå.</div>
        )}
        {orders.map((order) => (
          <div key={order.id} className="grid grid-cols-6 gap-2 px-4 py-3 text-sm items-center">
            <div>
              <p className="font-semibold">{order.orderNumber}</p>
              <p className="text-xs text-gray-500">
                {new Date(order.createdAt).toLocaleString("no-NO")}
              </p>
            </div>
            <div>
              <p className="font-semibold">{order.customer?.name || "Kunde"}</p>
              <p className="text-xs text-gray-500">{order.customer?.email}</p>
            </div>
            <div className="font-semibold">{Math.round(order.total)} kr</div>
            <div className="text-xs">
              {humanStatus(order.supplierOrderStatus)}
              {order.supplierEvents[0] && (
                <p className="text-gray-500">
                  Sist: {new Date(order.supplierEvents[0].createdAt).toLocaleString("no-NO")}
                </p>
              )}
            </div>
            <div className="text-xs text-red-600">
              {order.autoOrderError ? order.autoOrderError : "—"}
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <Link
                href={`/admin/orders/${order.id}`}
                className="text-blue-600 hover:underline"
              >
                Detaljer
              </Link>
              <Link
                href={`/api/admin/orders/${order.id}/send-to-supplier`}
                className="text-blue-600 hover:underline"
              >
                Send til leverandør
              </Link>
              <Link
                href={`/api/admin/orders/${order.id}/send-shipping-notification`}
                className="text-blue-600 hover:underline"
              >
                Resend shipping e-post
              </Link>
              <span className="text-gray-400">Refund (TODO)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

