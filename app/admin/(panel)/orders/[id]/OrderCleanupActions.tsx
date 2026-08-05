"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentStatus } from "@prisma/client";

type Props = {
  orderId: string;
  orderNumber: string;
  paymentStatus: PaymentStatus;
  isTestOrder: boolean;
  archivedAt: string | Date | null;
};

export function OrderCleanupActions({
  orderId,
  orderNumber,
  paymentStatus,
  isTestOrder: initialIsTest,
  archivedAt: initialArchivedAt,
}: Props) {
  const router = useRouter();
  const [isTestOrder, setIsTestOrder] = useState(initialIsTest);
  const [archivedAt, setArchivedAt] = useState<string | Date | null>(initialArchivedAt);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPermanent, setShowPermanent] = useState(false);
  const [slettInput, setSlettInput] = useState("");

  const isPaidProduction = paymentStatus === "paid" && !isTestOrder;

  const run = async (
    action: string,
    opts?: { confirmation?: string; reason?: string }
  ) => {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          confirmation: opts?.confirmation,
          reason: opts?.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Handling feilet");

      if (action === "archive") setArchivedAt(data.archivedAt);
      if (action === "restore") setArchivedAt(null);
      if (action === "mark_test") setIsTestOrder(true);
      if (action === "unmark_test") setIsTestOrder(false);
      if (action === "delete_test" || action === "permanent_delete") {
        setMessage(data.message);
        router.push("/admin/orders");
        router.refresh();
        return;
      }

      setMessage(data.message);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Handling feilet");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Opprydding</h2>
      <p className="mb-4 text-sm text-gray-600">
        Arkiver skjuler ordre. Sletting krever ubetalt/test-markering. Betalte
        produksjonsordrer kan ikke slettes.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {isTestOrder && (
          <span className="rounded-full bg-purple-100 px-2.5 py-1 font-medium text-purple-800">
            Testordre
          </span>
        )}
        {archivedAt && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900">
            Arkivert
          </span>
        )}
        {isPaidProduction && (
          <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-800">
            Betalt produksjon — sletting blokkert
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {archivedAt ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("restore")}
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "restore" ? "Gjenoppretter…" : "Gjenopprett fra arkiv"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              if (
                confirm(
                  `Arkivere ${orderNumber}?\n\nOrdren skjules fra standardlister, historikk bevares, og den kan gjenopprettes.`
                )
              ) {
                void run("archive");
              }
            }}
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy === "archive" ? "Arkiverer…" : "Arkiver ordre"}
          </button>
        )}

        {isTestOrder ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("unmark_test")}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "unmark_test" ? "…" : "Fjern testmarkering"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              if (
                confirm(
                  `Markere ${orderNumber} som testordre?\n\nKun eksplisitt markerte eller ubetalte ordre kan slettes. Betalte produksjonsordrer forblir beskyttet til de er markert.`
                )
              ) {
                void run("mark_test");
              }
            }}
            className="rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-medium text-purple-800 hover:bg-purple-50 disabled:opacity-50"
          >
            {busy === "mark_test" ? "…" : "Marker som testordre"}
          </button>
        )}

        <button
          type="button"
          disabled={!!busy || isPaidProduction}
          title={
            isPaidProduction
              ? "Betalte produksjonsordrer kan ikke slettes"
              : "Slett ubetalt/testordre"
          }
          onClick={() => {
            if (
              confirm(
                `Slette testordre ${orderNumber}?\n\nDette fjerner ordren og tilknyttede testdata permanent. Betalte produksjonsordrer er blokkert.`
              )
            ) {
              void run("delete_test", { reason: "Slett testordre (UI)" });
            }
          }}
          className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "delete_test" ? "Sletter…" : "Slett testordre"}
        </button>

        <button
          type="button"
          disabled={!!busy || isPaidProduction}
          title={
            isPaidProduction
              ? "Betalte produksjonsordrer kan ikke slettes"
              : "Permanent sletting krever bekreftelse SLETT"
          }
          onClick={() => {
            setSlettInput("");
            setShowPermanent(true);
          }}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Permanent slett…
        </button>
      </div>

      {showPermanent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="permanent-delete-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 id="permanent-delete-title" className="text-lg font-semibold text-gray-900">
              Permanent slett {orderNumber}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Dette kan ikke angres. Handling logges med admin og tidspunkt. Skriv{" "}
              <span className="font-mono font-semibold">SLETT</span> for å bekrefte.
            </p>
            <input
              autoFocus
              value={slettInput}
              onChange={(e) => setSlettInput(e.target.value)}
              placeholder="SLETT"
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPermanent(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={busy === "permanent_delete" || slettInput.trim() !== "SLETT"}
                onClick={() =>
                  void run("permanent_delete", {
                    confirmation: slettInput,
                    reason: "Permanent sletting (UI)",
                  }).then(() => setShowPermanent(false))
                }
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy === "permanent_delete" ? "Sletter…" : "Slett permanent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
