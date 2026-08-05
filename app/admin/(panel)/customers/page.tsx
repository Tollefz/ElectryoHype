import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import { Users } from "lucide-react";
import { safeQuery } from "@/lib/safeQuery";

export default async function AdminCustomers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q || "").trim();

  const customers = q
    ? await safeQuery(
        () =>
          prisma.customer.findMany({
            where: {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            },
            include: {
              orders: {
                orderBy: { createdAt: "desc" },
                take: 10,
              },
            },
            take: 25,
            orderBy: { createdAt: "desc" },
          }),
        [],
        "customers:search"
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-green-100 p-2.5">
          <Users className="h-5 w-5 text-green-600 sm:h-6 sm:w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Kunder</h1>
          <p className="text-sm text-gray-600">Søk opp kunde ved e-post, navn eller telefon</p>
        </div>
      </div>

      <form method="GET" className="flex flex-col gap-2 rounded-lg border bg-white p-4 shadow-sm sm:flex-row">
        <input
          name="q"
          defaultValue={q}
          placeholder="f.eks. kunde@epost.no"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Søk
        </button>
      </form>

      {!q && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-slate-900">Søk etter en kunde</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Skriv e-post, navn eller telefon for å se ordrer og leveringsstatus — det du trenger når kunden ringer.
          </p>
        </div>
      )}

      {q && customers.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900">Ingen treff</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ingen kunder fant for «{q}». Prøv også{" "}
            <Link
              href={`/admin/orders?search=${encodeURIComponent(q)}`}
              className="font-medium text-slate-900 underline underline-offset-2"
            >
              ordresøk
            </Link>
            .
          </p>
        </div>
      )}

      <div className="space-y-4">
        {customers.map((c) => {
          const paid = c.orders.filter((o) => o.paymentStatus === "paid").length;
          const refunded = c.orders.filter((o) => o.paymentStatus === "refunded").length;
          return (
            <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{c.name || "Uten navn"}</h2>
                  <p className="text-sm text-gray-600">{c.email}</p>
                  {c.phone && <p className="text-sm text-gray-600">{c.phone}</p>}
                </div>
                <div className="text-xs text-gray-500">
                  {c.orders.length} siste ordrer · {paid} betalt · {refunded} refundert
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-gray-500">
                    <th className="py-2">Ordre</th>
                    <th className="py-2">Betaling</th>
                    <th className="py-2">Oppfyllelse</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2">Dato</th>
                  </tr>
                </thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-medium text-green-600 hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="py-2">{o.paymentStatus}</td>
                      <td className="py-2">{o.fulfillmentStatus}</td>
                      <td className="py-2 text-right">{formatCurrency(o.total)}</td>
                      <td className="py-2 text-xs text-gray-500">
                        {new Date(o.createdAt).toLocaleDateString("no-NO")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
