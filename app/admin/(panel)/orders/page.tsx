import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import { Suspense } from "react";
import { OrderStatus, FulfillmentStatus } from "@prisma/client";
import { safeQuery } from "@/lib/safeQuery";

async function getOrders(filter?: string, search?: string) {
  const where: any = {};

  if (filter && filter !== "alle") {
    // Use fulfillmentStatus as single source of truth
    where.fulfillmentStatus = filter as FulfillmentStatus;
  }

  if (search && search.trim()) {
    where.OR = [
      { orderNumber: { contains: search.trim() } },
      { customer: { name: { contains: search.trim() } } },
      { customer: { email: { contains: search.trim() } } },
    ];
  }

  return await safeQuery(
    () =>
      prisma.order.findMany({
        where,
        include: {
          customer: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    [],
    "orders:list"
  );
}

function getFulfillmentStatusBadge(fulfillmentStatus: string) {
  const statusMap: Record<string, { label: string; className: string }> = {
    NEW: { label: "NY", className: "bg-yellow-100 text-yellow-800" },
    ORDERED_FROM_SUPPLIER: { label: "Bestilt hos leverandør", className: "bg-blue-100 text-blue-800" },
    SHIPPED: { label: "Sendt", className: "bg-indigo-100 text-indigo-800" },
    DELIVERED: { label: "Fullført", className: "bg-green-100 text-green-800" },
    CANCELLED: { label: "Kansellert", className: "bg-red-100 text-red-800" },
  };

  const config = statusMap[fulfillmentStatus] || {
    label: fulfillmentStatus,
    className: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function parseItems(items: any) {
  try {
    if (typeof items === "string") {
      return JSON.parse(items);
    }
    return items || [];
  } catch {
    return [];
  }
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("no-NO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { filter?: string; search?: string } | Promise<{ filter?: string; search?: string }>;
}) {
  // Håndter både sync og async searchParams (Next.js 14 vs 15)
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const filter = params.filter || "alle";
  const search = params.search || "";
  const orders = await getOrders(filter, search);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Ordrer</h1>
          <p className="mt-1 text-sm text-gray-600">Administrer alle ordrer</p>
        </div>
        <div className="text-sm font-medium text-gray-700">
          {orders.length} {orders.length === 1 ? "ordre" : "ordrer"}
        </div>
      </div>

      {/* Filter og søk */}
      <div className="rounded-lg bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
        <form method="GET" className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:gap-4">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter" className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
              Status:
            </label>
            <select
              id="filter"
              name="filter"
              defaultValue={filter}
              className="flex-1 sm:flex-none rounded-lg border border-gray-300 px-3 py-2 text-xs sm:text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 bg-white"
            >
              <option value="alle">Alle</option>
              <option value="NEW">NY</option>
              <option value="ORDERED_FROM_SUPPLIER">Bestilt hos leverandør</option>
              <option value="SHIPPED">Sendt</option>
              <option value="DELIVERED">Fullført</option>
              <option value="CANCELLED">Kansellert</option>
            </select>
          </div>

          {/* Søk */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              name="search"
              placeholder="Søk på ordrenummer, kunde navn eller e-post..."
              defaultValue={search}
              className="w-full rounded-lg border border-gray-300 px-3 sm:px-4 py-2 text-xs sm:text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-green-600 px-4 sm:px-6 py-2 text-xs sm:text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors whitespace-nowrap"
          >
            Søk
          </button>

          {search && (
            <Link
              href="/admin/orders"
              className="rounded-lg border border-gray-300 px-4 sm:px-6 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap text-center"
            >
              Nullstill
            </Link>
          )}
        </form>
      </div>

      {/* Ordre tabell */}
      <div className="overflow-hidden rounded-lg bg-white border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Ordrenummer</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Kunde</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Produkter</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Dato</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">Handlinger</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 sm:py-16 text-center">
                    {search || filter !== "alle" ? (
                      <div>
                        <p className="text-base sm:text-lg font-semibold text-gray-900">Ingen ordrer funnet</p>
                        <p className="mt-1 text-xs sm:text-sm text-gray-600">Prøv å endre søk eller filter</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-base sm:text-lg font-semibold text-gray-900">Ingen ordrer ennå</p>
                        <p className="mt-1 text-xs sm:text-sm text-gray-600">Når kunder bestiller, vil ordrene vises her</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const items = parseItems(order.items);
                  const itemCount = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);

                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-xs sm:text-sm font-semibold text-green-600 hover:text-green-700 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-gray-900">{order.customer?.name || "-"}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-none">{order.customer?.email || "-"}</div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <div className="text-xs sm:text-sm text-gray-900">
                          {itemCount} {itemCount === 1 ? "produkt" : "produkter"}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-none">
                          {items.length === 1 && items[0]?.name
                            ? items[0].name
                            : `${items.length} forskjellige produkter`}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-right">
                        <div className="text-xs sm:text-sm font-semibold text-gray-900">
                          {formatCurrency(Number(order.total))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                        {getFulfillmentStatusBadge(order.fulfillmentStatus || "NEW")}
                      </td>
                      <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                        <div className="text-xs sm:text-sm text-gray-600">
                          {formatDate(order.createdAt)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-xs sm:text-sm font-medium text-green-600 hover:text-green-700 hover:underline"
                        >
                          Se detaljer →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
