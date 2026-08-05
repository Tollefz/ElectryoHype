import Link from "next/link";
import BuyerClient from "./BuyerClient";

export default function DigitalBuyerPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Produktkjøper
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            AI finner og scorer — du velger, importerer og publiserer.
          </p>
        </div>
        <Link
          href="/admin/suppliers/merchandiser"
          className="text-sm font-semibold text-slate-800 underline-offset-2 hover:underline"
        >
          Trenger inspirasjon? Finn produkter →
        </Link>
      </div>
      <BuyerClient />
    </div>
  );
}
