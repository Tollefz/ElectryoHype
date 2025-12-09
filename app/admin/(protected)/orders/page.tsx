import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import { Suspense } from "react";
import { OrderStatus } from "@prisma/client";

async function getOrders(filter?: string, search?: string) {
  const where: any = {};

  if (filter && filter !== "alle") {
    // Konverter til riktig format (lowercase for Prisma enum)
    where.status = filter.toLowerCase() as OrderStatus;
  }

  if (search && search.trim()) {
    where.OR = [
      { orderNumber: { contains: search.trim() } },
      { customer: { name: { contains: search.trim() } } },
      { customer: { email: { contains: search.trim() } } },
    ];
  }

  return await prisma.order.findMany({
    where,
    include: {
      customer: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, { label: string; className: string }> = {
    pending: { label: "Venter", className: "bg-yellow-100 text-yellow-800" },
    paid: { label: "Betalt", className: "bg-green-100 text-green-800" },
    processing: { label: "Behandles", className: "bg-blue-100 text-blue-800" },
    shipped: { label: "Sendt", className: "bg-indigo-100 text-indigo-800" },
    delivered: { label: "Levert", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Kansellert", className: "bg-red-100 text-red-800" },
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ordrer</h1>
        <div className="text-sm text-gray-600">
          {orders.length} {orders.length === 1 ? "ordre" : "ordrer"}
        </div>
      </div>

      {/* Filter og søk */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <form method="GET" className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter" className="text-sm font-medium text-gray-700">
              Status:
            </label>
            <select
              id="filter"
              name="filter"
              defaultValue={filter}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="alle">Alle</option>
              <option value="pending">Venter</option>
              <option value="paid">Betalt</option>
              <option value="processing">Behandles</option>
              <option value="shipped">Sendt</option>
              <option value="delivered">Levert</option>
              <option value="cancelled">Kansellert</option>
            </select>
          </div>

          {/* Søk */}
          <div className="flex-1">
            <input
              type="text"
              name="search"
              placeholder="Søk på ordrenummer, kunde navn eller e-post..."
              defaultValue={search}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Søk
          </button>

          {search && (
            <Link
              href="/admin/orders"
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Nullstill
            </Link>
          )}
        </form>
      </div>

      {/* Ordre tabell */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Ordrenummer</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Kunde</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Produkter</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Total</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Dato</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Handlinger</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {search || filter !== "alle" ? (
                    <div>
                      <p className="text-lg font-medium">Ingen ordrer funnet</p>
                      <p className="mt-1 text-sm">Prøv å endre søk eller filter</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-medium">Ingen ordrer ennå</p>
                      <p className="mt-1 text-sm">Når kunder bestiller, vil ordrene vises her</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const items = parseItems(order.items);
                const itemCount = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);

                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{order.customer?.name || "-"}</div>
                        <div className="text-sm text-gray-500">{order.customer?.email || "-"}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {itemCount} {itemCount === 1 ? "produkt" : "produkter"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {items.length === 1 && items[0]?.name
                          ? items[0].name
                          : `${items.length} forskjellige produkter`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-medium">
                      {formatCurrency(Number(order.total))}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
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
  );
}
