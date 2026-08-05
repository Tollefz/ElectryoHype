import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  /** Subtle status line under description */
  meta?: ReactNode;
};

/**
 * Standard page header for all admin surfaces.
 */
export function AdminPageHeader({
  title,
  description,
  backHref,
  backLabel = "Tilbake",
  actions,
  meta,
}: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft size={14} />
            {backLabel}
          </Link>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            {description}
          </p>
        ) : null}
        {meta ? <div className="pt-1 text-xs text-slate-500">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

type AdminEmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Icon size={22} strokeWidth={1.75} />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AdminCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function AdminLoadingBlock({ label = "Laster…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500"
      role="status"
      aria-live="polite"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      {label}
    </div>
  );
}

/** Primary / secondary / ghost admin buttons — consistent across pages. */
export function adminBtnClass(
  variant: "primary" | "secondary" | "ghost" | "danger" = "secondary"
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50";
  switch (variant) {
    case "primary":
      return `${base} bg-slate-900 text-white hover:bg-slate-800`;
    case "danger":
      return `${base} bg-red-600 text-white hover:bg-red-700`;
    case "ghost":
      return `${base} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
    default:
      return `${base} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50`;
  }
}
