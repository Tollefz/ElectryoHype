import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCatalogSupplierMeta,
  isActiveCatalogSupplier,
} from "@/lib/suppliers/registry";
import SupplierCatalogClient from "../SupplierCatalogClient";

export const dynamic = "force-dynamic";

export default async function SupplierCatalogPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const meta = getCatalogSupplierMeta(supplierId);
  if (!meta || meta.status === "legacy") notFound();

  if (meta.status === "coming") {
    return (
      <div className="space-y-4">
        <nav className="text-sm text-slate-500">
          <Link href="/admin/suppliers" className="hover:text-emerald-700">
            Leverandører
          </Link>
          {" / "}
          <span className="text-slate-800">{meta.displayName}</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900">{meta.displayName}</h1>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {meta.description} Denne katalogintegrasjonen er ikke aktivert ennå.
        </p>
        <Link
          href="/admin/suppliers"
          className="inline-flex text-sm font-semibold text-emerald-700 hover:underline"
        >
          ← Tilbake til dashboard
        </Link>
      </div>
    );
  }

  if (!isActiveCatalogSupplier(supplierId)) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav className="text-sm text-slate-500">
            <Link href="/admin/suppliers" className="hover:text-emerald-700">
              Leverandører
            </Link>
            {" / "}
            <span className="text-slate-800">{meta.displayName}</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            {meta.displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{meta.description}</p>
        </div>
      </div>

      <SupplierCatalogClient supplierId={supplierId} displayName={meta.displayName} />
    </div>
  );
}
