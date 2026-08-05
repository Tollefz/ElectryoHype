"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  Loader2,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/format";
import { humanPaymentMethod } from "@/lib/order-labels";
import { StatusBadge, fulfillmentBadge, paymentBadge } from "@/components/admin/orders/order-ui";

export type AdminOrderRow = {
  id: string;
  orderNumber: string;
  total: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentMethod?: string | null;
  isTestOrder: boolean;
  archivedAt: string | null;
  createdAt: string;
  customerEmail: string | null;
  customerName: string | null;
  itemCount: number;
  country?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
};

export type OrderListFiltersState = {
  statusChip: string;
  payment: string;
  emailStatus: string;
  search: string;
  showArchived: boolean;
  page: number;
  pages: number;
  total: number;
  sort?: string;
};

function qsFromFilters(
  filters: OrderListFiltersState,
  overrides: Record<string, string> = {}
) {
  const merged = {
    chip: filters.statusChip,
    payment: filters.payment,
    email: filters.emailStatus,
    search: filters.search,
    page: String(filters.page),
    archived: filters.showArchived ? "1" : "",
    sort: filters.sort || "",
    ...overrides,
  };
  const clean = new URLSearchParams();
  if (merged.chip && merged.chip !== "alle") clean.set("chip", merged.chip);
  if (merged.payment && merged.payment !== "alle") clean.set("payment", merged.payment);
  if (merged.email) clean.set("email", merged.email);
  if (merged.search) clean.set("search", merged.search);
  if (merged.archived === "1") clean.set("archived", "1");
  if (merged.sort) clean.set("sort", merged.sort);
  if (merged.page && merged.page !== "1") clean.set("page", merged.page);
  const s = clean.toString();
  return s ? `/admin/orders?${s}` : "/admin/orders";
}

function formatRowDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("no-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function OrdersBulkClient({
  orders,
  filters,
}: {
  orders: AdminOrderRow[];
  filters: OrderListFiltersState;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState<"page" | "filtered" | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filterKey = useMemo(
    () =>
      [
        filters.statusChip,
        filters.payment,
        filters.emailStatus,
        filters.search,
        filters.showArchived ? "1" : "0",
        filters.page,
      ].join("|"),
    [filters]
  );

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(null);
    setOpenMenuId(null);
  }, [filterKey]);

  const pageIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const selectedCount = selectedIds.size;
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected =
    pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectMode(null);
  };

  const toggleSelectPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          for (const id of pageIds) next.add(id);
        } else {
          for (const id of pageIds) next.delete(id);
        }
        return next;
      });
      setSelectMode(checked ? "page" : null);
    },
    [pageIds]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        toggleSelectPage(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSelectPage]);

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(null);
  };

  const selectAllFiltered = async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "250");
      if (filters.statusChip !== "alle") params.set("chip", filters.statusChip);
      if (filters.payment !== "alle") params.set("payment", filters.payment);
      if (filters.emailStatus) params.set("email", filters.emailStatus);
      if (filters.search) params.set("search", filters.search);
      if (filters.showArchived) params.set("archived", "1");

      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !Array.isArray(data.data)) {
        toast.error(data?.error || "Kunne ikke hente filtrerte ordrer");
        return;
      }
      const ids = data.data.map((row: { id: string }) => row.id);
      setSelectedIds(new Set(ids));
      setSelectMode("filtered");
      const total = data.pagination?.total ?? ids.length;
      if (total > ids.length) {
        toast(`Valgte ${ids.length} av ${total} filtrerte (maks 250)`);
      } else {
        toast.success(`Valgte ${ids.length} filtrerte ordrer`);
      }
    } catch {
      toast.error("Kunne ikke velge filtrerte ordrer");
    }
  };

  const runBulkPost = async (action: "archive" | "mark_test" | "unmark_test") => {
    if (selectedCount === 0) {
      toast.error("Velg minst én ordre");
      return;
    }
    const ids = Array.from(selectedIds);
    const labels: Record<typeof action, string> = {
      archive: `Arkivere ${ids.length} ordre?`,
      mark_test: `Markere ${ids.length} ordre som testordre?`,
      unmark_test: `Fjerne testmerking for ${ids.length} ordre?`,
    };
    if (!window.confirm(labels[action])) return;

    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Bulk-handling feilet");
      }
      toast.success(data.message || "Oppdatert");
      clearSelection();
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Bulk-handling feilet");
    } finally {
      setBulkLoading(false);
    }
  };

  const executeBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setConfirmDeleteOpen(false);
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/orders/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Bulk-sletting feilet");
      }

      if (data.deleted > 0) {
        toast.success(`${data.deleted} ordre slettet`);
      }
      if (data.blocked > 0) {
        toast.error(
          `${data.blocked} ordre kunne ikke slettes fordi de allerede er i produksjon.`
        );
      }
      if (data.deleted === 0 && data.blocked === 0) {
        toast(data.message || "Ingen ordrer slettet");
      }

      clearSelection();
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Bulk-sletting feilet");
    } finally {
      setBulkLoading(false);
    }
  };

  const pageSize =
    filters.pages > 0
      ? Math.ceil(filters.total / filters.pages) || orders.length || 25
      : orders.length || 25;
  const start = filters.total === 0 ? 0 : (filters.page - 1) * pageSize + 1;
  const end = Math.min(filters.total, start + orders.length - 1);

  return (
    <div className="space-y-4">
      {selectedCount > 0 && (
        <div className="sticky top-[4.5rem] z-20 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-md backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
            <span className="font-semibold text-slate-900">{selectedCount} valgt</span>
            {selectMode === "filtered" && (
              <span className="text-xs text-slate-500">(filtrerte)</span>
            )}
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : null}
              Slett
            </button>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => void runBulkPost("archive")}
              className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Arkiver
            </button>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => void runBulkPost("mark_test")}
              className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Marker test
            </button>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => void runBulkPost("unmark_test")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Fjern test
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Fjern valg
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <button
          type="button"
          onClick={() => toggleSelectPage(true)}
          className="font-medium text-emerald-700 hover:underline"
        >
          Velg denne siden
        </button>
        <button
          type="button"
          onClick={() => void selectAllFiltered()}
          className="font-medium text-emerald-700 hover:underline"
        >
          Velg alle filtrerte
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="w-12 px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label="Velg alle på siden"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={(e) => toggleSelectPage(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                {(
                  [
                    "Ordre",
                    "Kunde",
                    "Dato",
                    "Land",
                    "Beløp",
                    "Betaling",
                    "Frakt",
                    "Status",
                    "Handlinger",
                  ] as const
                ).map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                      h === "Handlinger" ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-sm text-slate-500">
                    Ingen ordrer matcher filteret. Juster status eller søk.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const checked = selectedIds.has(order.id);
                  const { date, time } = formatRowDate(order.createdAt);
                  const fulfill = fulfillmentBadge(order.fulfillmentStatus);
                  const pay = paymentBadge(order.paymentStatus);
                  return (
                    <tr
                      key={order.id}
                      className={`border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80 ${
                        checked ? "bg-emerald-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-5">
                        <input
                          type="checkbox"
                          aria-label={`Velg ${order.orderNumber}`}
                          checked={checked}
                          onChange={() => toggleSelect(order.id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-4 py-5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-emerald-700"
                          >
                            {order.orderNumber}
                          </Link>
                          {order.isTestOrder && (
                            <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                              Test
                            </span>
                          )}
                          {order.archivedAt && (
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                              Arkiv
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="text-sm font-medium text-slate-900">
                          {order.customerName || "—"}
                        </div>
                        <div className="mt-0.5 max-w-[200px] truncate text-xs text-slate-500">
                          {order.customerEmail || "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-5">
                        <div className="text-sm text-slate-800">{date}</div>
                        <div className="text-xs text-slate-500">{time}</div>
                      </td>
                      <td className="px-4 py-5 text-sm text-slate-700">
                        {order.country || "—"}
                      </td>
                      <td className="px-4 py-5">
                        <div className="text-sm font-semibold text-slate-900">
                          {formatCurrency(order.total)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {order.itemCount} {order.itemCount === 1 ? "vare" : "varer"}
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="text-sm text-slate-800">
                          {humanPaymentMethod(order.paymentMethod)}
                        </div>
                        <div className="mt-1">
                          <StatusBadge tone={pay.tone}>{pay.label}</StatusBadge>
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="text-sm text-slate-800">
                          {order.carrier || "—"}
                        </div>
                        <div className="mt-0.5 max-w-[140px] truncate font-mono text-xs text-slate-500">
                          {order.trackingNumber || "Ingen tracking"}
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <StatusBadge tone={fulfill.tone}>{fulfill.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-5">
                        <div className="relative flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            title="Se ordre"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Eye size={18} />
                          </Link>
                          <Link
                            href={`/admin/orders/${order.id}#ordrehistorikk`}
                            title="Kommentar / historikk"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <MessageSquare size={18} />
                          </Link>
                          <button
                            type="button"
                            title="Flere handlinger"
                            onClick={() =>
                              setOpenMenuId((id) => (id === order.id ? null : order.id))
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {openMenuId === order.id && (
                            <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                              <Link
                                href={`/admin/orders/${order.id}`}
                                className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                              >
                                Åpne ordre
                              </Link>
                              <Link
                                href={`/admin/orders/${order.id}/print`}
                                target="_blank"
                                className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                              >
                                Pakkseddel
                              </Link>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {filters.total === 0
              ? "Ingen ordrer"
              : `Viser ${start}–${end} av ${filters.total} ordrer`}
          </p>
          {filters.pages > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filters.page > 1 && (
                <Link
                  href={qsFromFilters(filters, { page: String(filters.page - 1) })}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Forrige
                </Link>
              )}
              {Array.from({ length: Math.min(filters.pages, 7) }, (_, i) => {
                let p = i + 1;
                if (filters.pages > 7) {
                  const windowStart = Math.max(
                    1,
                    Math.min(filters.page - 3, filters.pages - 6)
                  );
                  p = windowStart + i;
                }
                const active = p === filters.page;
                return (
                  <Link
                    key={p}
                    href={qsFromFilters(filters, { page: String(p) })}
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-2.5 text-sm font-semibold ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </Link>
                );
              })}
              {filters.page < filters.pages && (
                <Link
                  href={qsFromFilters(filters, { page: String(filters.page + 1) })}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Neste
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmDeleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-delete-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="bulk-delete-title" className="text-lg font-semibold text-slate-900">
              Slette {selectedCount} ordre?
            </h2>
            <p className="mt-2 text-sm text-slate-600">Dette kan ikke angres.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => void executeBulkDelete()}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Slett
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
