import { Package, ShoppingCart, DollarSign, Clock, Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getStoreIdFromHeaders } from "@/lib/store";
import { headers } from "next/headers";

async function getDashboardStats(storeId: string) {
  const [totalProducts, totalOrders, totalRevenue, pendingOrders, dropship] = await Promise.all([
    prisma.product.count({ where: { isActive: true, storeId } }),
    prisma.order.count({ where: { storeId } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { paymentStatus: "paid", storeId },
    }),
    prisma.order.count({ where: { status: "pending", storeId } }),
    prisma.order.groupBy({
      by: ["supplierOrderStatus"],
      where: { supplierOrderStatus: { not: null }, storeId },
      _count: { _all: true },
    }),
  ]);

  const shippedLast24h = await prisma.order.count({
    where: {
      supplierOrderStatus: "SHIPPED",
      updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      storeId,
    },
  });

  const dropshippingMap = dropship.reduce<Record<string, number>>((acc, cur) => {
    acc[cur.supplierOrderStatus as string] = cur._count._all;
    return acc;
  }, {});

  const autoOrderError = await prisma.order.count({
    where: { autoOrderError: { not: null }, storeId },
  });

  return {
    totalProducts,
    totalOrders,
    totalRevenue: Number(totalRevenue._sum.total ?? 0),
    pendingOrders,
    dropshipping: {
      pending: dropshippingMap["PENDING"] ?? 0,
      sent: dropshippingMap["SENT_TO_SUPPLIER"] ?? 0,
      error: autoOrderError,
      shippedLast24h,
    },
  };
}

export default async function AdminDashboard() {
  const storeId = getStoreIdFromHeaders(headers());
  const stats = await getDashboardStats(storeId);
  const cards = [
    {
      title: "Totale Produkter",
      value: stats.totalProducts.toString(),
      icon: Package,
      color: "bg-orange-500",
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
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{card.title}</p>
                  <p className="mt-2 text-3xl font-bold">{card.value}</p>
                </div>
                <div className={`${card.color} rounded-lg p-3 text-white`}>
                  <Icon size={24} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-xl font-semibold">Dropshipping status</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">PENDING hos leverandør</p>
            <p className="text-2xl font-bold">{stats.dropshipping.pending}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Sendt til leverandør</p>
            <p className="text-2xl font-bold">{stats.dropshipping.sent}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Feil ved auto-bestilling</p>
            <p className="text-2xl font-bold">{stats.dropshipping.error}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Sendt siste 24 timer</p>
            <p className="text-2xl font-bold">{stats.dropshipping.shippedLast24h}</p>
          </div>
        </div>
        <div className="flex gap-3 text-sm text-blue-600">
          <a href="/admin/support/orders">Se support-konsoll</a>
          <a href="/admin/support/orders?supplierStatus=SENT_TO_SUPPLIER">Filtrer: sendt</a>
          <a href="/admin/support/orders?errorOnly=true">Filtrer: feil</a>
        </div>
      </div>
    </div>
  );
}

