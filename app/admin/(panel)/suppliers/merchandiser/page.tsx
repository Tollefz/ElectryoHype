import Link from "next/link";
import MerchandiserClient from "./MerchandiserClient";

export default function MerchandiserPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav className="text-sm text-slate-500">
            <span>Leverandører</span>
            <span className="mx-1.5">/</span>
            <span className="text-slate-800">AI Merchandiser</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">AI Merchandiser</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Oppdagelse og inspirasjon med store kort — typisk 20–100 produkter. Søk,
            analyser og importer manuelt. For tusenvis av kandidater: bruk Digital Buyer.
          </p>
        </div>
        <Link
          href="/admin/buyer"
          className="text-sm font-semibold text-emerald-800 hover:underline"
        >
          Masse-review → Digital Buyer
        </Link>
      </div>
      <MerchandiserClient />
    </div>
  );
}
