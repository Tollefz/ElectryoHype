"use client";

export function PrintButton({ label = "Skriv ut" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
    >
      {label}
    </button>
  );
}
