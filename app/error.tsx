'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to error reporting service
    console.error('Error:', error);
  }, [error]);

  return (
    <div className="mx-auto min-h-screen max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <AlertCircle size={40} className="text-red-600" />
      </div>
      <h1 className="mb-4 text-2xl font-bold text-dark">Noe gikk galt</h1>
      <p className="mb-6 text-gray-medium">
        {error.message || 'En uventet feil oppstod. Vennligst prøv igjen.'}
      </p>
      <div className="flex gap-4 justify-center">
        <button
          onClick={reset}
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
        >
          Prøv igjen
        </button>
        <Link
          href="/"
          className="rounded-lg border border-gray-border px-6 py-3 font-semibold text-dark hover:bg-gray-light transition-colors"
        >
          Gå til forsiden
        </Link>
      </div>
    </div>
  );
}

