import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { safeQueryResult } from "@/lib/safeQuery";
import {
  buildOrderListWhere,
  type OrderStatusChip,
} from "@/lib/ops/order-list-where";
import OrdersBulkClient, {
  type AdminOrderRow,
} from "@/components/admin/OrdersBulkClient";
import { DataState } from "@/components/admin/DataState";
import type { AdminDataError } from "@/lib/admin/data-errors";
import { runAdminPage } from "@/lib/admin/run-admin-page";
import { countryFromShipping } from "@/components/admin/orders/order-ui";

interface OrderListItem {
  quantity?: number;
}

function parseItems(items: unknown): OrderListItem[] {
  try {
    if (typeof items === "string") {
      const parsed: unknown = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as OrderListItem[]) : [];
    }
    return Array.isArray(items) ? (items as OrderListItem[]) : [];
  } catch {
    return [];
  }
}

const STATUS_CHIPS: { id: OrderStatusChip; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "ny", label: "Ny" },
  { id: "bekreftet", label: "Bekreftet" },
  { id: "behandles", label: "Behandles" },
  { id: "sendt", label: "Sendt" },
  { id: "levert", label: "Levert" },
  { id: "retur", label: "Retur" },
  { id: "kansellert", label: "Kansellert" },
];

async function getOrders(opts: {
  statusChip?: string;
  payment?: string;
  emailStatus?: string;
  search?: string;
  archived?: boolean;
  page: number;
  limit: number;
}) {
  const where = buildOrderListWhere({
    statusChip: opts.statusChip,
    payment: opts.payment,
    emailStatus: opts.emailStatus,
    search: opts.search,
    archived: opts.archived,
  });
  const skip = (opts.page - 1) * opts.limit;
  const [ordersRes, totalRes] = await Promise.all([
    safeQueryResult(
      () =>
        prisma.order.findMany({
          where,
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: opts.limit,
        }),
      "orders:list"
    ),
    safeQueryResult(() => prisma.order.count({ where }), "orders:count"),
  ]);

  if (!ordersRes.ok || !totalRes.ok) {
    return {
      ok: false as const,
      error: ordersRes.error || totalRes.error,
      orders: [],
      total: 0,
    };
  }

  return {
    ok: true as const,
    error: null as AdminDataError | null,
    orders: ordersRes.data,
    total: totalRes.data,
  };
}

async function getChipCounts(archived: boolean) {
  const base = { archived };
  const chips = STATUS_CHIPS.map((c) => c.id);
  const results = await Promise.all(
    chips.map(async (chip) => {
      if (chip === "retur") return [chip, 0] as const;
      const res = await safeQueryResult(
        () =>
          prisma.order.count({
            where: buildOrderListWhere({ ...base, statusChip: chip }),
          }),
        `orders:chip:${chip}`
      );
      return [chip, res.ok ? res.data : 0] as const;
    })
  );
  return Object.fromEntries(results) as Record<OrderStatusChip, number>;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    chip?: string;
    payment?: string;
    email?: string;
    search?: string;
    page?: string;
    archived?: string;
    sort?: string;
  }>;
}) {
  return runAdminPage("orders", "/admin/orders", async () => {
    const params = await searchParams;
    // Back-compat: ?filter=NEW → chip
    const legacyFilter = params.filter || "";
    const statusChip =
      params.chip ||
      (legacyFilter === "NEW"
        ? "ny"
        : legacyFilter === "ORDERED_FROM_SUPPLIER"
          ? "behandles"
          : legacyFilter === "SHIPPED"
            ? "sendt"
            : legacyFilter === "DELIVERED"
              ? "levert"
              : legacyFilter === "CANCELLED"
                ? "kansellert"
                : "alle");
    const payment = params.payment || "alle";
    const emailStatus = params.email || "";
    const search = params.search || "";
    const showArchived = params.archived === "1";
    const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
    const limit = 25;
    const sort = params.sort || "";

    const [result, chipCounts] = await Promise.all([
      getOrders({
        statusChip,
        payment,
        emailStatus,
        search,
        archived: showArchived,
        page,
        limit,
      }),
      getChipCounts(showArchived),
    ]);

    if (!result.ok) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Ordrer
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Administrer, spor og oppfyll kundeordrer
            </p>
          </div>
          <DataState state="error" surface="orders" error={result.error} />
        </div>
      );
    }

    const { orders, total } = result;
    const pages = Math.max(1, Math.ceil(total / limit));

    const qs = (overrides: Record<string, string>) => {
      const merged = {
        chip: statusChip,
        payment,
        email: emailStatus,
        search,
        page: String(page),
        archived: showArchived ? "1" : "",
        sort,
        ...overrides,
      };
      const clean = new URLSearchParams();
      if (merged.chip && merged.chip !== "alle") clean.set("chip", merged.chip);
      if (merged.payment && merged.payment !== "alle")
        clean.set("payment", merged.payment);
      if (merged.email) clean.set("email", merged.email);
      if (merged.search) clean.set("search", merged.search);
      if (merged.archived === "1") clean.set("archived", "1");
      if (merged.sort) clean.set("sort", merged.sort);
      if (merged.page && merged.page !== "1") clean.set("page", merged.page);
      const s = clean.toString();
      return s ? `/admin/orders?${s}` : "/admin/orders";
    };

    const rows: AdminOrderRow[] = orders.map((order) => {
      const items = parseItems(order.items);
      const itemCount = items.reduce(
        (sum: number, item: OrderListItem) => sum + (item.quantity || 1),
        0
      );
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        paymentMethod: order.paymentMethod,
        isTestOrder: order.isTestOrder,
        archivedAt: order.archivedAt ? order.archivedAt.toISOString() : null,
        createdAt: order.createdAt.toISOString(),
        customerEmail: order.customer?.email || order.customerEmail || null,
        customerName: order.customer?.name || null,
        itemCount,
        country: countryFromShipping(order.shippingAddress),
        carrier: order.shippingCarrier,
        trackingNumber: order.trackingNumber,
      };
    });

    return (
      <div className="space-y-6 pb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {showArchived ? "Arkiverte ordrer" : "Ordrer"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              {showArchived
                ? "Skjult fra standardlister — kan gjenopprettes fra ordredetaljer"
                : "Administrer, spor og oppfyll kundeordrer"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={showArchived ? "/admin/orders" : "/admin/orders?archived=1"}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              {showArchived ? "Aktive ordrer" : "Arkiv"}
            </Link>
            <button
              type="button"
              disabled
              title="Kommer snart"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 shadow-sm"
            >
              Eksporter
            </button>
            <button
              type="button"
              disabled
              title="Kommer snart"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 shadow-sm"
            >
              Importer
            </button>
            <button
              type="button"
              disabled
              title="Kommer snart"
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm opacity-80"
            >
              + Ny manuell ordre
            </button>
          </div>
        </div>

        {/* Status chips */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px">
          {STATUS_CHIPS.map((chip) => {
            const active = statusChip === chip.id;
            const count = chipCounts[chip.id] ?? 0;
            return (
              <Link
                key={chip.id}
                href={qs({ chip: chip.id, page: "1" })}
                className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? "text-emerald-700"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {chip.label}{" "}
                <span
                  className={`text-xs font-medium ${
                    active ? "text-emerald-600" : "text-slate-400"
                  }`}
                >{`(${count})`}</span>
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-600" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Sticky filter bar */}
        <form
          method="GET"
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-sm backdrop-blur"
        >
          {showArchived && <input type="hidden" name="archived" value="1" />}
          {statusChip !== "alle" && (
            <input type="hidden" name="chip" value={statusChip} />
          )}
          <div className="min-w-[200px] flex-1 basis-56">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Søk ordre…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <select
            disabled
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500"
            aria-label="Land"
          >
            <option>Alle land</option>
          </select>
          <select
            disabled
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500"
            aria-label="Periode"
          >
            <option>Velg periode</option>
          </select>
          <select
            name="payment"
            defaultValue={payment}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
          >
            <option value="alle">Betaling</option>
            <option value="pending">Ubetalt</option>
            <option value="paid">Betalt</option>
            <option value="failed">Feilet</option>
            <option value="refunded">Refundert</option>
          </select>
          <select
            disabled
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500"
            aria-label="Oppfyllelse"
          >
            <option>Oppfyllelse</option>
          </select>
          <select
            disabled
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500"
            aria-label="Fraktleverandør"
          >
            <option>Fraktleverandør</option>
          </select>
          <select
            name="email"
            defaultValue={emailStatus}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
            aria-label="Flere filtre"
          >
            <option value="">Flere filtre</option>
            <option value="FAILED">E-post feilet</option>
          </select>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
          >
            <option value="">Sorter etter</option>
            <option value="newest">Nyeste først</option>
            <option value="oldest">Eldste først</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Filtrer
          </button>
        </form>

        <OrdersBulkClient
          orders={rows}
          filters={{
            statusChip,
            payment,
            emailStatus,
            search,
            showArchived,
            page,
            pages,
            total,
            sort,
          }}
        />
      </div>
    );
  });
}
