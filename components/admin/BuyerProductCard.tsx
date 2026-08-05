"use client";

import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Images,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { DeskBuyerCandidateCard } from "@/lib/ops/desk-buyer-groups";
import { BuyerImageGallery } from "@/components/admin/BuyerImageGallery";
import {
  DISLIKE_REASON_LABELS,
  type DislikeReason,
} from "@/lib/buyer/admin-preferences-client";

export type BuyerCardDensity = "compact" | "standard" | "large";

type Props = {
  card: DeskBuyerCandidateCard;
  density: BuyerCardDensity;
  busy?: boolean;
  reviewed?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onImport: (id: string) => void;
  onReviewed: (id: string) => void;
  onSkip?: (id: string) => void;
  onThumb?: (
    id: string,
    vote: "up" | "down",
    reasons?: DislikeReason[]
  ) => Promise<void> | void;
  /** Label for the primary publish/prepare button */
  primaryActionLabel?: string;
};

/**
 * Procurement card — AI finds → you choose. Essentials first.
 */
export function BuyerProductCard({
  card,
  density,
  busy,
  reviewed,
  selected,
  onSelect,
  onImport,
  onReviewed,
  onSkip,
  onThumb,
  primaryActionLabel = "Publiser",
}: Props) {
  const [open, setOpen] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [dislikeOpen, setDislikeOpen] = useState(false);
  const hoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgH =
    density === "compact" ? "h-36" : density === "large" ? "h-56" : "h-48";

  const mediaCount = (card.images?.length || 0) + (card.videos?.length || 0);
  const signals = (card.explainSignals || []).slice(0, 4);
  const plus = signals.filter((s) => s.polarity === "plus");
  const minus = signals.filter((s) => s.polarity === "minus");

  return (
    <li
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${
        reviewed
          ? "border-slate-100 opacity-80"
          : selected
            ? "border-emerald-400 ring-2 ring-emerald-100"
            : "border-slate-200"
      }`}
    >
      <button
        type="button"
        className={`relative w-full overflow-hidden bg-slate-100 ${imgH}`}
        onClick={() => mediaCount > 0 && setGallery(true)}
        onMouseEnter={() => {
          if (mediaCount < 1) return;
          hoverRef.current = setTimeout(() => setGallery(true), 500);
        }}
        onMouseLeave={() => {
          if (hoverRef.current) clearTimeout(hoverRef.current);
          hoverRef.current = null;
        }}
        aria-label="Åpne bilder"
      >
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt=""
            className="h-full w-full object-cover transition hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Ingen bilde
          </div>
        )}
        {mediaCount > 1 && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Images className="h-3 w-3" />
            {mediaCount}
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">
          Butikkmatch {card.explainPct ?? card.shopMatchPct}%
        </span>
        {card.assortmentScore != null && (
          <span
            className={`absolute left-1.5 top-8 rounded-md px-2 py-0.5 text-[10px] font-bold text-white ${
              card.assortmentScore >= 10
                ? "bg-sky-700"
                : card.assortmentScore < 0
                  ? "bg-amber-700"
                  : "bg-slate-600"
            }`}
          >
            Sortiment {card.assortmentScore >= 0 ? "+" : ""}
            {card.assortmentScore}
            {card.assortmentHave != null && card.assortmentTarget != null
              ? ` · ${card.assortmentHave}/${card.assortmentTarget}`
              : ""}
          </span>
        )}
        {card.productFocusStars != null && card.productFocusStars > 0 && (
          <span className="absolute left-1.5 top-[3.75rem] rounded-md bg-violet-800 px-2 py-0.5 text-[10px] font-bold text-white">
            Fokus {"★".repeat(card.productFocusStars)}
            {card.productFocusLabel ? ` ${card.productFocusLabel}` : ""}
          </span>
        )}
        {!card.fitsElectroHype && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Usikker kategori
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {card.taxonomyPath || card.categoryLabel}
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
            {card.title}
          </h3>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="text-slate-400">Leverandør</dt>
            <dd className="font-semibold text-slate-800">
              {card.supplier || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Butikkmatch</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.shopMatchPct != null ? `${card.shopMatchPct}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Score</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.butikkscore != null
                ? `${card.butikkscore}`
                : card.overallScore != null
                  ? `${card.overallScore}`
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Innkjøp</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.costNOK != null ? `${card.costNOK} kr` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Frakt</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.shippingNOK != null ? `${card.shippingNOK} kr` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Landed cost</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.landedCostNOK != null ? `${card.landedCostNOK} kr` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Anbefalt utsalgspris</dt>
            <dd className="font-semibold tabular-nums text-emerald-800">
              {card.retailNOK != null ? `${card.retailNOK} kr` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Fortjeneste</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.profitNOK != null
                ? `${card.profitNOK} kr`
                : card.retailNOK != null && card.landedCostNOK != null
                  ? `${Math.round(card.retailNOK - card.landedCostNOK)} kr`
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Margin</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {card.marginPct != null ? `${card.marginPct}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Lager</dt>
            <dd className="font-semibold text-slate-800">
              {card.inStock === true
                ? "På lager"
                : card.inStock === false
                  ? "Usikker"
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Leveringstid</dt>
            <dd className="font-semibold text-slate-800">
              {card.deliveryHint || "—"}
            </dd>
          </div>
        </dl>

        {(card.butikkscore != null ||
          (card.butikkBreakdown && card.butikkBreakdown.length > 0)) && (
          <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
            <p className="text-[11px] font-semibold text-slate-900">
              Butikkscore{" "}
              <span className="tabular-nums">
                {card.butikkscore ?? "—"}/100
              </span>
              {card.butikkRecommendation ? (
                <span className="ml-2 font-medium text-emerald-800">
                  · {card.butikkRecommendation}
                </span>
              ) : null}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-700">
              {(card.butikkBreakdown || []).map((row) => (
                <li key={row.id} className="flex justify-between gap-2">
                  <span>
                    <span className={row.ok ? "text-emerald-700" : "text-amber-700"}>
                      {row.ok ? "✔" : "⚠"}
                    </span>{" "}
                    {row.label}
                    {row.detail ? (
                      <span className="text-slate-500"> — {row.detail}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-800">
                    {row.asPercent != null
                      ? `${row.asPercent}%`
                      : `${row.points}`}
                  </span>
                </li>
              ))}
            </ul>
            {card.profitNOK != null && (
              <p className="mt-1 text-[10px] text-slate-500">
                Forventet fortjeneste {card.profitNOK} kr
              </p>
            )}
          </div>
        )}

        {(card.landedCostNOK != null ||
          card.economicConfidence != null ||
          (card.economicChecks && card.economicChecks.length > 0)) && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-2.5 py-2">
            <p className="text-[11px] font-semibold text-emerald-950">
              Økonomisk grunnlag
              {card.economicConfidence != null
                ? ` · sikkerhet ${card.economicConfidence}%`
                : ""}
            </p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-700">
              {card.landedCostNOK != null && (
                <div className="col-span-2 flex justify-between font-semibold text-slate-900">
                  <dt>Landed Cost</dt>
                  <dd>{card.landedCostNOK} kr</dd>
                </div>
              )}
              {card.costNOK != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Innkjøp</dt>
                  <dd>{card.costNOK} kr</dd>
                </div>
              )}
              {card.shippingNOK != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Frakt</dt>
                  <dd>{card.shippingNOK} kr</dd>
                </div>
              )}
              {card.feesNOK != null && card.feesNOK > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Gebyr</dt>
                  <dd>{card.feesNOK} kr</dd>
                </div>
              )}
              {card.vatNOK != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">MVA</dt>
                  <dd>{Math.round(card.vatNOK)} kr</dd>
                </div>
              )}
              {card.marginPct != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Margin</dt>
                  <dd>{card.marginPct}%</dd>
                </div>
              )}
            </dl>
            {card.fxRate != null && (
              <p className="mt-1 text-[10px] text-slate-500">
                Valutakurs USD/NOK {card.fxRate.toFixed(2)}
                {card.fxFetchedAt
                  ? ` · ${new Date(card.fxFetchedAt).toLocaleString("nb-NO", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </p>
            )}
            {(card.economicChecks?.length || 0) > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
                {card.economicChecks!.slice(0, 5).map((r) => (
                  <li key={r.label}>
                    <span className={r.ok ? "text-emerald-700" : "text-amber-700"}>
                      {r.ok ? "✔" : "⚠"} {r.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(card.economicFlags?.length || 0) > 0 && (
              <p className="mt-1 text-[11px] font-medium text-amber-800">
                {card.economicFlags![0]}
              </p>
            )}
          </div>
        )}

        {(card.priceReasons?.length || card.priceConfidence != null) && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2">
            <p className="text-[11px] font-semibold text-slate-700">
              Prisgrunn
              {card.priceConfidence != null
                ? ` · AI confidence ${card.priceConfidence}%`
                : ""}
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
              {(card.priceReasons || []).slice(0, 4).map((r) => (
                <li key={r.label}>
                  <span className={r.ok ? "text-emerald-700" : "text-amber-700"}>
                    {r.ok ? "✔" : "–"} {r.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-0.5 text-xs">
          {plus.slice(0, 2).map((s) => (
            <li key={s.id} className="text-emerald-700">
              + {s.label}
            </li>
          ))}
          {minus.slice(0, 2).map((s) => (
            <li key={s.id} className="text-amber-700">
              − {s.label}
            </li>
          ))}
        </ul>

        {(card.whyFoundStars && card.whyFoundStars.length > 0) ||
        (card.productFocusStars != null && card.productFocusStars > 0) ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-2.5 py-2">
            <p className="text-[11px] font-semibold text-violet-950">
              Hvorfor fant AI dette?
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-800">
              {(card.whyFoundStars || []).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="text-amber-500">
                      {"★".repeat(row.stars)}
                      {"☆".repeat(5 - row.stars)}
                    </span>{" "}
                    {row.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {onThumb && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onThumb(card.id, "up")}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                title="👍 Liker denne typen — lærer AI-en"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">JA</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDislikeOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="👎 Ikke anbefal denne typen"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">NEI</span>
              </button>
            </>
          )}
          {onSelect && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelect(card.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                selected
                  ? "bg-emerald-700 text-white"
                  : "border border-emerald-600 text-emerald-800 hover:bg-emerald-50"
              }`}
            >
              {selected ? "Valgt ✓" : "Velg"}
            </button>
          )}
          <button
            type="button"
            disabled={busy || !card.canImport}
            onClick={() => onImport(card.id)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            title={
              card.canImport
                ? "Klargjør og publiser"
                : "Mangler importkobling"
            }
          >
            {primaryActionLabel}
          </button>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-800"
            onClick={() => setOpen((v) => !v)}
          >
            Detaljer
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {dislikeOpen && onThumb && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
            <p className="mb-1.5 text-[11px] text-slate-600">
              Valgfritt — hvorfor mistror du produktet?
            </p>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(DISLIKE_REASON_LABELS) as DislikeReason[]).map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={busy}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:border-slate-400"
                    onClick={() => {
                      void onThumb(card.id, "down", [r]);
                      setDislikeOpen(false);
                    }}
                  >
                    {DISLIKE_REASON_LABELS[r]}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={busy}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-white"
                onClick={() => {
                  void onThumb(card.id, "down");
                  setDislikeOpen(false);
                }}
              >
                Send uten begrunnelse
              </button>
            </div>
          </div>
        )}

        {open && (
          <div className="space-y-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
            <p className="font-medium text-slate-800">
              Butikkmatch {card.explainPct ?? card.shopMatchPct}%
              {card.storeRelevance != null
                ? ` · Butikkrelevans ${card.storeRelevance}%`
                : ""}
              {card.explainCapped ? " · tak anvendt" : ""}
            </p>
            {card.assortmentScore != null && (
              <p className="font-medium text-slate-800">
                Sortimentscore{" "}
                {card.assortmentScore >= 0 ? "+" : ""}
                {card.assortmentScore}
                {card.assortmentHave != null && card.assortmentTarget != null
                  ? ` · dekning ${card.assortmentHave}/${card.assortmentTarget}`
                  : ""}
              </p>
            )}
            {card.productFocusStars != null && card.productFocusStars > 0 && (
              <p className="font-medium text-violet-900">
                Produktfokus {"★".repeat(card.productFocusStars)}
                {"☆".repeat(5 - card.productFocusStars)}
                {card.productFocusLabel ? ` · ${card.productFocusLabel}` : ""}
                {card.productFocusScore != null
                  ? ` · +${card.productFocusScore}`
                  : ""}
              </p>
            )}
            {card.productFocusWhy && card.productFocusWhy.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-violet-800">
                {card.productFocusWhy.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            )}
            {card.assortmentWhy && card.assortmentWhy.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-sky-800">
                {card.assortmentWhy.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            )}
            {card.explainBreakdown && card.explainBreakdown.length > 0 && (
              <ul className="space-y-0.5 font-mono text-[11px] text-slate-500">
                {card.explainBreakdown.map((b) => (
                  <li key={b.component}>
                    {b.component.padEnd(28, " ")}{" "}
                    {b.points >= 0 ? "+" : ""}
                    {b.points}
                  </li>
                ))}
              </ul>
            )}
            <p className="font-medium text-slate-800">Signaler</p>
            <ul className="space-y-1">
              {(card.explainSignals || []).map((s) => (
                <li key={s.id}>
                  <span
                    className={
                      s.polarity === "plus"
                        ? "text-emerald-700"
                        : s.polarity === "minus"
                          ? "text-amber-700"
                          : "text-slate-500"
                    }
                  >
                    {s.polarity === "plus"
                      ? "+"
                      : s.polarity === "minus"
                        ? "−"
                        : "·"}{" "}
                    {s.label}
                    <span className="text-slate-400">
                      {" "}
                      ({s.points > 0 ? "+" : ""}
                      {s.points})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-400">
              Leverandør: {card.supplier} · Score {card.overallScore}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onReviewed(card.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold"
              >
                <Check className="h-3 w-3" /> Sett som sett
              </button>
              {onSkip && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSkip(card.id)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold"
                >
                  Hopp over
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {gallery && (
        <BuyerImageGallery
          images={card.images?.length ? card.images : card.imageUrl ? [card.imageUrl] : []}
          videos={card.videos || []}
          title={card.title}
          onClose={() => setGallery(false)}
        />
      )}
    </li>
  );
}
