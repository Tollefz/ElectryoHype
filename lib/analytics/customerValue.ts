import { prisma } from "@/lib/prisma";

export async function getCustomerValueMetrics(storeId?: string | null) {
  const whereStore = storeId ? { storeId } : {};

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      ...whereStore,
    },
    select: {
      id: true,
      customerId: true,
      total: true,
    },
  });

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const uniqueCustomers = new Set(orders.map((o) => o.customerId).filter(Boolean)).size || 1;
  const aov = totalRevenue / orders.length || 0;
  const clv = totalRevenue / uniqueCustomers || 0;
  const repeatRate = uniqueCustomers
    ? orders.filter((o) => o.customerId).length / uniqueCustomers
    : 0;

  return {
    totalRevenue,
    aov,
    clv,
    repeatRate,
  };
}

