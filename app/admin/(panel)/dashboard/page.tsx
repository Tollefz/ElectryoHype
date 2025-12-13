import { Package, ShoppingCart, DollarSign, Clock, Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { safeQuery } from "@/lib/safeQuery";
import Link from "next/link";

async function getDashboardStats(storeId: string) {
  const [totalProducts, activeProducts, totalOrders, totalRevenue, pendingOrders, dropship, productsByStore, categories] = await Promise.all([
    safeQuery(() => prisma.product.count(), 0, "dashboard:products:total"),
    safeQuery(() => prisma.product.count({ where: { isActive: true, storeId } }), 0, "dashboard:products:active"),
    safeQuery(() => prisma.order.count({ where: { storeId } }), 0, "dashboard:orders"),
    safeQuery(
      () =>
        prisma.order.aggregate({
          _sum: { total: true },
          where: { paymentStatus: "paid", storeId },
        }),
      { _sum: { total: 0 } },
      "dashboard:revenue"
    ),
    safeQuery(() => prisma.order.count({ where: { status: "pending", storeId } }), 0, "dashboard:pending-orders"),
    safeQuery(
      () =>
        prisma.order.groupBy({
          by: ["supplierOrderStatus"],
          where: { supplierOrderStatus: { not: null }, storeId },
          _count: { _all: true },
        }),
      [],
      "dashboard:dropship"
    ),
    safeQuery(
      () =>
        prisma.product.groupBy({
          by: ["storeId"],
          _count: { _all: true },
        }),
      [],
      "dashboard:products:by-store"
    ),
    safeQuery(
      () =>
        prisma.product.findMany({
          where: { category: { not: null }, isActive: true },
          select: { category: true },
          distinct: ["category"],
        }),
      [],
      "dashboard:categories"
    ),
  ]);

  const shippedLast24h = await safeQuery(
    () =>
      prisma.order.count({
        where: {
          supplierOrderStatus: "SHIPPED",
          updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          storeId,
        },
      }),
    0,
    "dashboard:shipped24h"
  );

  const dropshippingMap = dropship.reduce<Record<string, number>>((acc, cur) => {
    acc[cur.supplierOrderStatus as string] = cur._count._all;
    return acc;
  }, {});

  const autoOrderError = await safeQuery(
    () =>
      prisma.order.count({
        where: { autoOrderError: { not: null }, storeId },
      }),
    0,
    "dashboard:auto-order-error"
  );

  return {
    totalProducts,
    activeProducts,
    totalOrders,
    totalRevenue: Number(totalRevenue._sum.total ?? 0),
    pendingOrders,
    productsByStore: productsByStore as Array<{ storeId: string | null; _count: { _all: number } }>,
    categoryCount: categories.length,
    dropshipping: {
      pending: dropshippingMap["PENDING"] ?? 0,
      sent: dropshippingMap["SENT_TO_SUPPLIER"] ?? 0,
      error: autoOrderError,
      shippedLast24h,
    },
  };
}

export default async function AdminDashboard() {
  const storeId = await getStoreIdFromHeadersServer();
  const stats = await getDashboardStats(storeId);
  const cards = [
    {
      title: "Totale Produkter",
      value: stats.totalProducts.toString(),
      icon: Package,
      color: "bg-orange-500",
    },
    {
      title: "Aktive Produkter",
      value: stats.activeProducts.toString(),
      icon: Package,
      color: "bg-green-500",
    },
    {
      title: "Totale Ordrer",
      value: stats.totalOrders.toString(),
      icon: ShoppingCart,
      color: "bg-green-500",
    },
    {
      title: "Total Omsetning",
      value: formatCurrency(stats.totalRevenue),
      icon: DollarSign,
      color: "bg-purple-500",
    },
    {
      title: "Ventende Ordrer",
      value: stats.pendingOrders.toString(),
      icon: Clock,
      color: "bg-orange-500",
    },
    {
      title: "Dropshipping status",
      value: `${stats.dropshipping.pending} pend / ${stats.dropshipping.sent} sendt`,
      icon: Truck,
      color: "bg-blue-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Oversikt over butikken din</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-lg bg-white border border-gray-200 p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">{card.title}</p>
                  <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">{card.value}</p>
                </div>
                <div className={`${card.color} rounded-lg p-2.5 sm:p-3 text-white flex-shrink-0 ml-3`}>
                  <Icon size={20} className="sm:w-6 sm:h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Dropshipping status</h2>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-gray-600 font-medium">PENDING hos leverandør</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-gray-900">{stats.dropshipping.pending}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-gray-600 font-medium">Sendt til leverandør</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-gray-900">{stats.dropshipping.sent}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-gray-600 font-medium">Feil ved auto-bestilling</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-red-600">{stats.dropshipping.error}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-gray-600 font-medium">Sendt siste 24 timer</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-green-600">{stats.dropshipping.shippedLast24h}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 sm:gap-3 text-xs sm:text-sm">
          <Link href="/admin/support/orders" className="text-green-600 hover:text-green-700 hover:underline font-medium">Se support-konsoll</Link>
          <span className="text-gray-300">|</span>
          <Link href="/admin/support/orders?supplierStatus=SENT_TO_SUPPLIER" className="text-green-600 hover:text-green-700 hover:underline font-medium">Filtrer: sendt</Link>
          <span className="text-gray-300">|</span>
          <Link href="/admin/support/orders?errorOnly=true" className="text-green-600 hover:text-green-700 hover:underline font-medium">Filtrer: feil</Link>
        </div>
      </div>

      {/* Produkter per store */}
      <div className="rounded-lg bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
        <h2 className="mb-4 text-lg sm:text-xl font-semibold text-gray-900">Produkter per Store</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-xs sm:text-sm font-semibold text-gray-700">Store ID</th>
                <th className="pb-2 text-xs sm:text-sm font-semibold text-gray-700 text-right">Antall Produkter</th>
              </tr>
            </thead>
            <tbody>
              {stats.productsByStore.length > 0 ? (
                stats.productsByStore.map((item) => (
                  <tr key={item.storeId || "null"} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 sm:py-3 text-sm font-medium text-gray-900">{item.storeId || "(null)"}</td>
                    <td className="py-2.5 sm:py-3 text-sm text-gray-600 text-right">{item._count._all}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="py-4 text-sm text-gray-500 text-center">Ingen produkter funnet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kategorier */}
      <div className="rounded-lg bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
        <h2 className="mb-2 text-lg sm:text-xl font-semibold text-gray-900">Kategorier</h2>
        <p className="text-sm sm:text-base text-gray-600">Antall unike kategorier: <span className="font-semibold text-gray-900">{stats.categoryCount}</span></p>
      </div>
    </div>
  );
}

