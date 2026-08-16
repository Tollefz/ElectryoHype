import Link from 'next/link';
import { Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto min-h-screen max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
        <Search size={40} className="text-gray-400" />
      </div>
      <h1 className="mb-2 text-6xl font-bold text-brand">404</h1>
      <h2 className="mb-4 text-2xl font-bold text-dark">Siden ble ikke funnet</h2>
      <p className="mb-8 text-gray-medium">
        Siden du leter etter eksisterer ikke eller har blitt flyttet.
      </p>
      <div className="flex gap-4 justify-center">
        <Link
          href="/"
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
        >
          Gå til forsiden
        </Link>
        <Link
          href="/products"
          className="rounded-lg border border-gray-border px-6 py-3 font-semibold text-dark hover:bg-gray-light transition-colors"
        >
          Se produkter
        </Link>
      </div>
    </div>
  );
}

