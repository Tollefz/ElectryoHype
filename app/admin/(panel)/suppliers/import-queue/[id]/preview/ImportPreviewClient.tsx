"use client";

import Link from "next/link";
import { PipelineStepper } from "@/components/admin/supplier/PipelineStepper";
import { ScoreBar, StatusBadge } from "@/components/admin/supplier/StatusBadge";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";

type Completeness = {
  score?: number;
  requiresReview?: boolean;
  summary?: string;
  parts?: Array<{
    label: string;
    got: number;
    expected: number;
    ok: boolean;
    detail?: string;
  }>;
};

type Props = {
  item: {
    id: string;
    status: string;
    error: string | null;
    reviewReason?: string | null;
    autoApproved?: boolean;
    supplierPrice: number | null;
    supplierCurrency: string | null;
    title?: string | null;
    mappedDraft: unknown;
    enrichment: unknown;
    pricing: unknown;
    completeness: Completeness | null;
    imageReport: unknown;
  };
  product: {
    id: string;
    name: string;
    isActive: boolean;
    price: number;
    compareAtPrice?: number | null;
    supplierPrice: number | null;
    images: string;
    stock: number;
    category?: string | null;
    sku: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    shortDescription?: string | null;
    description?: string | null;
    importCompleteness: Completeness | null;
    variants: Array<{ id: string; name: string; stock: number }>;
  } | null;
  fieldCoverage: Array<{
    field: string;
    storedAs: string;
    status: string;
    notes: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export default function ImportPreviewClient({ item, product }: Props) {
  const draft = asRecord(item.mappedDraft);
  const enrichment = asRecord(item.enrichment);
  const pricing = asRecord(item.pricing);
  const completeness = (product?.importCompleteness ||
    item.completeness) as Completeness | null;

  let storeImages: string[] = [];
  try {
    storeImages = product?.images ? (JSON.parse(product.images) as string[]) : [];
  } catch {
    storeImages = [];
  }
  const supplierImages = Array.isArray(draft.sourceImages)
    ? (draft.sourceImages as string[])
    : Array.isArray(draft.images)
      ? (draft.images as string[])
      : [];

  const supplierTitle = String(draft.title || item.title || "—");
  const storeTitle = product?.name || String(enrichment.title || "—");
  const supplierSpecs = asRecord(draft.specifications);
  const margin =
    product?.price && product.supplierPrice
      ? Math.round(((product.price - product.supplierPrice) / product.price) * 100)
      : pricing.marginPct != null
        ? Math.round(Number(pricing.marginPct))
        : null;

  return (
    <div className="space-y-5">
      <SupplierEngineTabs />
      <PipelineStepper status={item.status} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <StatusBadge status={item.status} />
        {completeness?.score != null ? <ScoreBar score={completeness.score} /> : null}
        {item.autoApproved ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Auto-godkjent
          </span>
        ) : null}
        {item.error || item.reviewReason ? (
          <span className="text-xs text-amber-800">{item.error || item.reviewReason}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {product ? (
            <Link
              href={`/admin/products/edit/${product.id}`}
              className="rounded-xl border px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
            >
              Rediger utkast
            </Link>
          ) : null}
          <Link
            href="/admin/suppliers/import-queue"
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
          >
            Tilbake til kø
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: supplier */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Original leverandørdata
          </h2>
          <div className="mt-4 space-y-4">
            <div className="flex gap-3 overflow-x-auto">
              {(supplierImages.length ? supplierImages : [null]).slice(0, 4).map((url, i) => (
                <div
                  key={i}
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
              ))}
            </div>
            <Field label="Tittel" value={supplierTitle} />
            <Field
              label="Pris"
              value={
                item.supplierPrice != null
                  ? `${item.supplierPrice} ${item.supplierCurrency || ""}`
                  : "—"
              }
            />
            <Field label="Kategori" value={String(draft.category || "—")} />
            <Field
              label="Lager"
              value={draft.stock != null ? String(draft.stock) : "—"}
            />
            <Field
              label="Varianter"
              value={Array.isArray(draft.variants) ? String(draft.variants.length) : "0"}
            />
            <div>
              <div className="text-xs font-semibold text-slate-500">Specs</div>
              <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-sm text-slate-800">
                {Object.keys(supplierSpecs).length === 0 ? (
                  <li className="text-slate-400">Ingen</li>
                ) : (
                  Object.entries(supplierSpecs)
                    .slice(0, 12)
                    .map(([k, v]) => (
                      <li key={k}>
                        <span className="text-slate-500">{k}:</span> {String(v)}
                      </li>
                    ))
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* Right: ElectroHypeX */}
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            ElectroHypeX · AI · SEO · pris
          </h2>
          <div className="mt-4 space-y-4">
            <div className="flex gap-3 overflow-x-auto">
              {(storeImages.length ? storeImages : [null]).slice(0, 4).map((url, i) => (
                <div
                  key={i}
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
              ))}
            </div>
            <Compare
              label="Tittel"
              before={supplierTitle}
              after={storeTitle}
            />
            <Field
              label="Salgspris"
              value={
                product
                  ? `${product.price} NOK`
                  : pricing.recommendedSalePrice != null
                    ? `${pricing.recommendedSalePrice} NOK`
                    : "—"
              }
            />
            <Field
              label="Kost"
              value={
                product?.supplierPrice != null
                  ? `${product.supplierPrice} NOK`
                  : "—"
              }
            />
            <Field label="Margin" value={margin != null ? `${margin}%` : "—"} />
            <Field
              label="Kategori"
              value={product?.category || String(enrichment.category || "—")}
            />
            <Field
              label="SEO tittel"
              value={product?.metaTitle || String(enrichment.metaTitle || "—")}
            />
            <Field
              label="SEO beskrivelse"
              value={
                product?.metaDescription || String(enrichment.metaDescription || "—")
              }
            />
            <Field
              label="AI-status"
              value={
                enrichment.aiGenerated
                  ? "AI-generert"
                  : enrichment.warning
                    ? `Fallback: ${String(enrichment.warning)}`
                    : "—"
              }
            />
            <Field
              label="Status"
              value={
                product?.isActive
                  ? "Publisert (aktiv)"
                  : product
                    ? "Utkast (inaktiv)"
                    : item.status
              }
            />
            <Field
              label="Varianter lagret"
              value={String(product?.variants?.length ?? 0)}
            />
          </div>
        </section>
      </div>

      {completeness?.parts?.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Completeness</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {completeness.parts.map((p) => (
              <div
                key={p.label}
                className={`rounded-xl px-3 py-2 text-sm ${
                  p.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs">
                  {p.got}/{p.expected}
                  {p.detail ? ` · ${p.detail}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900">{value}</div>
    </div>
  );
}

function Compare({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  const changed = before.trim() !== after.trim();
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        {label}
        {changed ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-800">
            AI endret
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
            Uendret
          </span>
        )}
      </div>
      <div className="mt-0.5 text-sm font-medium text-slate-900">{after}</div>
      {changed ? (
        <div className="mt-0.5 text-xs text-slate-500 line-through">{before}</div>
      ) : null}
    </div>
  );
}
