"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Sparkles,
  Star,
  X,
  XCircle,
} from "lucide-react";
import { IMPORT_CATEGORIES } from "@/lib/import/types";
import type { ImportEditableField } from "@/lib/import/types";
import { getEditedFieldLabels } from "@/lib/import/field-labels";
import { getDynamicMarkupPct } from "@/lib/import/pricing";
import { htmlToReadableText, readableTextToHtml } from "@/lib/import/html-text";
import { calculateProductScore, type ProductScore } from "@/lib/import/product-score";
import { detectProductWarnings, type ProductWarning } from "@/lib/import/product-warnings";
import { runQualityCheck, type QualityCheckResult } from "@/lib/import/quality-check";
import {
  BUYER_APPROVED_SCORE,
  BUYER_REVIEW_MIN_SCORE,
} from "@/lib/import/buyer-policy";
import { getSubcategoriesFor } from "@/lib/import/subcategories";

export interface ProductImportData {
  name: string;
  originalName: string;
  description: string;
  originalDescription: string;
  price: number;
  originalPrice: number;
  suggestedPrice: number;
  compareAtPrice: number;
  shortDescription: string;
  images: string[];
  variants?: Array<{
    name: string;
    price: number;
    compareAtPrice?: number | null;
    image?: string | null;
    attributes: Record<string, string>;
    stock: number | null;
    sku?: string | null;
  }>;
  category: string;
  subcategory?: string | null;
  tags: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  deliveryTime: string;
  specs: Record<string, string>;
  supplier: string;
  highlightedFeatures?: string[];
  aiGenerated?: boolean;
  aiWarning?: string;
}

interface ProductImportPreviewProps {
  data: ProductImportData;
  editedFields: Partial<Record<ImportEditableField, boolean>>;
  improving?: boolean;
  onFieldChange: (field: ImportEditableField, value: string | number | string[] | null) => void;
  onImprove: (forceOverwrite: boolean) => void;
  /** Called when the admin picks a new primary image (reordered list). */
  onImagesChange?: (images: string[]) => void;
  /** Called when the admin changes the subcategory. */
  onSubcategoryChange?: (subcategory: string | null) => void;
}

function ReadOnlyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-medium mb-1">{label}</label>
      <div className="rounded border border-gray-border bg-gray-50 px-3 py-2 text-sm text-gray-600 whitespace-pre-wrap">
        {value || "—"}
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  edited,
  onChange,
  type = "text",
  rows,
  maxLength,
  hint,
}: {
  label: string;
  value: string | number;
  edited?: boolean;
  onChange: (value: string) => void;
  type?: "text" | "number" | "textarea";
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-gray-medium">{label}</label>
        {edited && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            Redigert
          </span>
        )}
      </div>
      {type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows || 4}
          maxLength={maxLength}
          className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      )}
      {hint && <p className="mt-1 text-xs text-gray-medium">{hint}</p>}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= BUYER_APPROVED_SCORE) return "#00C853";
  if (score >= BUYER_REVIEW_MIN_SCORE) return "#FFB300";
  return "#e53935";
}

function ScoreRing({ score }: { score: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative h-24 w-24 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#eee" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference - progress}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-[10px] text-gray-medium">av 10</span>
      </div>
    </div>
  );
}

function ProductScoreCard({ score }: { score: ProductScore }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-border bg-white p-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={score.overall} />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-dark">AI Produktscore</h3>
          <p className="mt-0.5 text-xs text-gray-medium">
            {score.overall >= BUYER_APPROVED_SCORE
              ? `APPROVED (≥ ${BUYER_APPROVED_SCORE}) – klart anbefalt for ElectroHypeX.`
              : score.overall >= BUYER_REVIEW_MIN_SCORE
                ? `REVIEW (${BUYER_REVIEW_MIN_SCORE}–${BUYER_APPROVED_SCORE}) – eier kan bestemme.`
                : `REJECTED (under ${BUYER_REVIEW_MIN_SCORE}) – ikke importer.`}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-1 text-xs font-medium text-brand hover:underline"
          >
            {expanded ? "Skjul begrunnelse" : "Vis begrunnelse"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-gray-border pt-3">
          {score.factors.map((factor) => (
            <div key={factor.key} className="flex items-start gap-2">
              <div className="mt-0.5 w-24 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-dark">{factor.label}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(factor.score / 10) * 100}%`,
                      backgroundColor: scoreColor(factor.score),
                    }}
                  />
                </div>
              </div>
              <p className="flex-1 text-xs text-gray-medium">{factor.reason}</p>
              <span
                className="text-xs font-bold"
                style={{ color: scoreColor(factor.score) }}
              >
                {factor.score.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningsCard({ warnings }: { warnings: ProductWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
        <CheckCircle2 size={18} className="flex-shrink-0 text-green-600" />
        <p className="text-sm text-green-800">Ingen problemer oppdaget.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-border bg-white p-4">
      <h3 className="mb-2 text-sm font-bold text-dark">
        Advarsler ({warnings.length})
      </h3>
      <ul className="space-y-2">
        {warnings.map((warning) => (
          <li
            key={warning.code}
            className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${
              warning.severity === "critical"
                ? "bg-red-50 text-red-800"
                : warning.severity === "info"
                  ? "bg-gray-50 text-gray-700"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            {warning.severity === "critical" ? (
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-600" />
            ) : (
              <AlertTriangle
                size={14}
                className={`mt-0.5 flex-shrink-0 ${
                  warning.severity === "info" ? "text-gray-500" : "text-amber-600"
                }`}
              />
            )}
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QualityChecklist({ result }: { result: QualityCheckResult }) {
  const decision = result.buyerDecision;
  const badgeClass =
    decision === "approved" && result.passed
      ? "bg-green-100 text-green-700"
      : decision === "rejected" || result.blockingFailures > 0
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";
  const badgeLabel =
    decision === "approved" && result.passed
      ? "APPROVED"
      : decision === "review"
        ? `REVIEW – eier kan bestemme`
        : decision === "rejected"
          ? "REJECTED – kan ikke importeres"
          : `${result.failedCount} punkt(er) mangler`;

  return (
    <div className="rounded-lg border border-gray-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-dark">Kvalitetssjekk</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>
      {decision === "review" && (
        <p className="mb-2 text-xs text-amber-800">
          Produktet er i REVIEW-sonen. Policyen anbefaler forsiktighet, men du kan
          fortsatt importere hvis du mener produktet passer.
        </p>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {result.checks.map((check) => (
          <div key={check.key} className="flex items-start gap-1.5 text-xs">
            {check.ok ? (
              <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-green-600" />
            ) : (
              <XCircle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
            )}
            <div>
              <span className={check.ok ? "text-dark" : "font-medium text-red-700"}>
                {check.label}
                {!check.ok && check.blocking ? " · blokkerer" : ""}
              </span>
              {check.detail && (
                <span className="ml-1 text-gray-medium">({check.detail})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingPanel({
  data,
  editedFields,
  onFieldChange,
}: {
  data: ProductImportData;
  editedFields: Partial<Record<ImportEditableField, boolean>>;
  onFieldChange: ProductImportPreviewProps["onFieldChange"];
}) {
  const cost = data.originalPrice;
  const price = data.suggestedPrice;
  const profit = price - cost;
  const markupPct = cost > 0 ? (profit / cost) * 100 : 0;
  const marginPct = price > 0 ? (profit / price) * 100 : 0;
  // Low margin is relative to the dynamic pricing curve for this cost level
  const expectedMarkupPct = getDynamicMarkupPct(cost);
  const lowMargin = expectedMarkupPct > 0 && markupPct / expectedMarkupPct < 0.75;

  return (
    <div className="rounded-lg border border-gray-border bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-dark">Priser og fortjeneste</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <ReadOnlyBlock label="Kostpris (leverandør)" value={`${Math.round(cost)} kr`} />
        <EditableField
          label="Foreslått salgspris"
          value={Math.round(data.suggestedPrice)}
          edited={editedFields.suggestedPrice}
          onChange={(value) => onFieldChange("suggestedPrice", parseFloat(value) || 0)}
          type="number"
        />
        <EditableField
          label="Før-pris (rabatt)"
          value={data.compareAtPrice ? Math.round(data.compareAtPrice) : ""}
          edited={editedFields.compareAtPrice}
          onChange={(value) => onFieldChange("compareAtPrice", value ? parseFloat(value) : null)}
          type="number"
        />
      </div>
      <div
        className={`mt-3 grid grid-cols-3 gap-3 rounded-lg p-3 ${
          lowMargin ? "border border-red-200 bg-red-50" : "border border-green-200 bg-green-50"
        }`}
      >
        <div>
          <div className="text-[11px] text-gray-medium">Fortjeneste</div>
          <div className={`text-lg font-bold ${lowMargin ? "text-red-700" : "text-green-700"}`}>
            {Math.round(profit)} kr
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-medium">Margin</div>
          <div className={`text-lg font-bold ${lowMargin ? "text-red-700" : "text-green-700"}`}>
            {Math.round(marginPct)} %
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-medium">Påslag (markup)</div>
          <div className={`text-lg font-bold ${lowMargin ? "text-red-700" : "text-green-700"}`}>
            {Math.round(markupPct)} %
          </div>
          <div className="text-[10px] text-gray-medium">
            Priskurve: ~{Math.round(expectedMarkupPct)} %
          </div>
        </div>
        {lowMargin && (
          <div className="col-span-3 flex items-center gap-1.5 text-xs text-red-700">
            <AlertTriangle size={13} />
            Påslaget ({Math.round(markupPct)} %) ligger under priskurven (~{Math.round(expectedMarkupPct)} % for denne kostprisen) – vurder å øke salgsprisen.
          </div>
        )}
      </div>
    </div>
  );
}

function ImageGallery({
  images,
  productName,
  onImagesChange,
}: {
  images: string[];
  productName: string;
  onImagesChange?: (images: string[]) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <AlertCircle size={16} />
        Ingen produktbilder funnet.
      </div>
    );
  }

  const setPrimary = (index: number) => {
    if (!onImagesChange || index === 0) return;
    const next = [images[index], ...images.filter((_, i) => i !== index)];
    onImagesChange(next);
  };

  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-gray-medium">
        Produktbilder ({images.length}) – klikk et bilde for å sette det som hovedbilde
      </label>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {images.map((img, imgIdx) => (
          <button
            key={img}
            type="button"
            onClick={() => setPrimary(imgIdx)}
            className={`group relative aspect-square overflow-hidden rounded border-2 transition-colors ${
              imgIdx === 0
                ? "border-brand ring-2 ring-brand/30"
                : "border-gray-border hover:border-brand/50"
            }`}
            title={imgIdx === 0 ? "Hovedbilde" : "Sett som hovedbilde"}
          >
            <Image
              src={img}
              alt={`${productName} - bilde ${imgIdx + 1}`}
              fill
              sizes="120px"
              className="object-cover"
            />
            {imgIdx === 0 && (
              <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
                <Star size={9} fill="currentColor" />
                Hoved
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function HtmlPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-dark">Forhåndsvisning av beskrivelse</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-medium hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <div
          className="text-sm leading-relaxed text-dark [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-bold [&_li]:mb-1 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function DescriptionEditor({
  html,
  edited,
  onChange,
}: {
  html: string;
  edited?: boolean;
  onChange: (html: string) => void;
}) {
  const [text, setText] = useState(() => htmlToReadableText(html));
  const [showPreview, setShowPreview] = useState(false);

  // Resync when the description changes externally (e.g. "Improve with AI")
  useEffect(() => {
    setText((current) => {
      const currentAsHtml = readableTextToHtml(current);
      if (currentAsHtml !== html) {
        return htmlToReadableText(html);
      }
      return current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-gray-medium">
          Generert beskrivelse (lesbar tekst)
        </label>
        <div className="flex items-center gap-2">
          {edited && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Redigert
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1 rounded border border-gray-border px-2 py-1 text-[11px] font-medium text-dark hover:bg-gray-50"
          >
            <Eye size={12} />
            Forhåndsvis HTML
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          const nextText = e.target.value;
          setText(nextText);
          onChange(readableTextToHtml(nextText));
        }}
        rows={14}
        className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <p className="mt-1 text-xs text-gray-medium">
        Overskrifter avsluttes med kolon (f.eks. «Fordeler:»), punkter starter med «•» eller «-».
        HTML genereres automatisk.
      </p>
      {showPreview && (
        <HtmlPreviewModal html={readableTextToHtml(text)} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

function SpecsTable({ specs }: { specs: Record<string, string> }) {
  const entries = Object.entries(specs).filter(([, value]) => value && value.trim());
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle size={13} />
        Ingen spesifikasjoner funnet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-gray-border">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([key, value], idx) => (
            <tr key={key} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
              <td className="w-1/3 px-3 py-1.5 font-medium text-dark">{key}</td>
              <td className="px-3 py-1.5 text-gray-600">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantsTable({ variants }: { variants: NonNullable<ProductImportData["variants"]> }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-gray-medium">
        Varianter ({variants.length})
      </label>
      <div className="max-h-64 overflow-y-auto rounded border border-gray-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="text-left text-[11px] text-gray-medium">
              <th className="px-3 py-2">Bilde</th>
              <th className="px-3 py-2">Navn</th>
              <th className="px-3 py-2">Attributter</th>
              <th className="px-3 py-2">Pris</th>
              <th className="px-3 py-2">Lager</th>
              <th className="px-3 py-2">SKU</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant, vIdx) => (
              <tr key={vIdx} className="border-t border-gray-border">
                <td className="px-3 py-1.5">
                  {variant.image ? (
                    <div className="relative h-9 w-9 overflow-hidden rounded">
                      <Image
                        src={variant.image}
                        alt={variant.name}
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <span className="text-gray-medium">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-medium text-dark">{variant.name}</td>
                <td className="px-3 py-1.5 text-gray-medium">
                  {Object.entries(variant.attributes || {})
                    .filter(([key]) => key !== "farge")
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(", ") || "—"}
                </td>
                <td className="px-3 py-1.5">{Math.round(variant.price)} kr</td>
                <td className="px-3 py-1.5">
                  {typeof variant.stock === "number" ? variant.stock : "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px]">{variant.sku || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductImportPreview({
  data,
  editedFields,
  improving = false,
  onFieldChange,
  onImprove,
  onImagesChange,
  onSubcategoryChange,
}: ProductImportPreviewProps) {
  const tagsValue = data.tags.join(", ");
  const editedLabels = getEditedFieldLabels(editedFields);
  const hasManualEdits = editedLabels.length > 0;
  const subcategoryOptions = getSubcategoriesFor(data.category);

  const score = useMemo(
    () =>
      calculateProductScore({
        costNOK: data.originalPrice,
        suggestedPrice: data.suggestedPrice,
        category: data.category,
        subcategory: data.subcategory,
        name: data.name,
        originalTitle: data.originalName,
        description: data.description,
        imagesCount: data.images.length,
        variantsCount: data.variants?.length ?? 0,
        specsCount: Object.keys(data.specs).length,
        descriptionLength: data.description.replace(/<[^>]+>/g, "").length,
      }),
    [data]
  );

  const warnings = useMemo(
    () =>
      detectProductWarnings({
        name: data.name,
        description: data.description,
        originalTitle: data.originalName,
        costNOK: data.originalPrice,
        suggestedPrice: data.suggestedPrice,
        category: data.category,
        subcategory: data.subcategory,
        images: data.images,
        variants: data.variants ?? [],
        specs: data.specs,
      }),
    [data]
  );

  const qualityCheck = useMemo(
    () =>
      runQualityCheck({
        name: data.name,
        description: data.description,
        originalTitle: data.originalName,
        images: data.images,
        suggestedPrice: data.suggestedPrice,
        costNOK: data.originalPrice,
        category: data.category,
        subcategory: data.subcategory,
        slug: data.slug,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        tags: data.tags,
        specs: data.specs,
        variantsCount: data.variants?.length ?? 0,
      }),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-border bg-gray-50 p-3">
        <div className="text-sm text-gray-medium">
          {hasManualEdits
            ? `${editedLabels.length} manuelt redigert(e) felt beholdes ved AI-forbedring.`
            : "Alle felt kan forbedres med AI."}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onImprove(false)}
            disabled={improving}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {improving ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Forbedrer...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Improve with AI
              </>
            )}
          </button>
          {hasManualEdits && !improving && (
            <button
              type="button"
              onClick={() => onImprove(true)}
              className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50"
            >
              Overskriv manuelle endringer
            </button>
          )}
        </div>
      </div>

      {hasManualEdits && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Bevares: {editedLabels.join(", ")}
        </div>
      )}
      {data.aiWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {data.aiWarning}
        </div>
      )}

      {data.aiGenerated && !data.aiWarning && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          AI-generert innhold er klart for gjennomgang.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProductScoreCard score={score} />
        <WarningsCard warnings={warnings} />
      </div>

      <ImageGallery
        images={data.images}
        productName={data.name}
        onImagesChange={onImagesChange}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReadOnlyBlock label="Original tittel" value={data.originalName} />
        <EditableField
          label="Generert tittel"
          value={data.name}
          edited={editedFields.name}
          onChange={(value) => onFieldChange("name", value)}
          maxLength={60}
          hint={`${data.name.length}/60 tegn${data.name.length < 45 ? " (helst 45-60)" : ""}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReadOnlyBlock label="Original beskrivelse" value={data.originalDescription} />
        <DescriptionEditor
          html={data.description}
          edited={editedFields.description}
          onChange={(html) => onFieldChange("description", html)}
        />
      </div>

      <EditableField
        label="Kort beskrivelse"
        value={data.shortDescription}
        edited={editedFields.shortDescription}
        onChange={(value) => onFieldChange("shortDescription", value)}
        type="textarea"
        rows={2}
        maxLength={150}
      />

      {data.highlightedFeatures && data.highlightedFeatures.length > 0 && (
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-medium">
            Viktige egenskaper
          </label>
          <ul className="space-y-1 rounded border border-brand/20 bg-brand/5 p-3">
            {data.highlightedFeatures.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-dark">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PricingPanel data={data} editedFields={editedFields} onFieldChange={onFieldChange} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-gray-medium">Kategori</label>
            {editedFields.category && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                Redigert
              </span>
            )}
          </div>
          <select
            value={data.category}
            onChange={(e) => onFieldChange("category", e.target.value)}
            className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {IMPORT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-medium">Underkategori</label>
          <select
            value={data.subcategory || ""}
            onChange={(e) => onSubcategoryChange?.(e.target.value || null)}
            disabled={!onSubcategoryChange || subcategoryOptions.length === 0}
            className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-gray-50"
          >
            <option value="">Ingen underkategori</option>
            {subcategoryOptions.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
            {data.subcategory && !subcategoryOptions.includes(data.subcategory) && (
              <option value={data.subcategory}>{data.subcategory}</option>
            )}
          </select>
        </div>

        <ReadOnlyBlock label="Leveringstid" value={data.deliveryTime} />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-gray-medium">
          Tekniske spesifikasjoner ({Object.keys(data.specs).length})
        </label>
        <SpecsTable specs={data.specs} />
      </div>

      <EditableField
        label="Søkeord / SEO-tags (kommaseparert)"
        value={tagsValue}
        edited={editedFields.tags}
        onChange={(value) =>
          onFieldChange(
            "tags",
            value
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        }
        hint={`${data.tags.length} søkeord – bruk fraser folk faktisk søker etter`}
      />

      <EditableField
        label="Produkt-slug"
        value={data.slug}
        edited={editedFields.slug}
        onChange={(value) => onFieldChange("slug", value)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <EditableField
          label="Meta-tittel"
          value={data.metaTitle}
          edited={editedFields.metaTitle}
          onChange={(value) => onFieldChange("metaTitle", value)}
          maxLength={60}
          hint={`${data.metaTitle.length}/60 tegn`}
        />
        <EditableField
          label="Meta-beskrivelse"
          value={data.metaDescription}
          edited={editedFields.metaDescription}
          onChange={(value) => onFieldChange("metaDescription", value)}
          type="textarea"
          rows={3}
          maxLength={155}
          hint={`${data.metaDescription.length}/155 tegn`}
        />
      </div>

      {data.variants && data.variants.length > 0 && (
        <VariantsTable variants={data.variants} />
      )}

      <QualityChecklist result={qualityCheck} />
    </div>
  );
}
