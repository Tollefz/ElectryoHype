"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  Activity,
  Cpu,
  ScrollText,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const TABS: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}> = [
  {
    href: "/admin/suppliers",
    label: "Oversikt",
    icon: LayoutDashboard,
    match: (p) => p === "/admin/suppliers",
  },
  {
    href: "/admin/suppliers/merchandiser",
    label: "Finn produkter",
    icon: Sparkles,
    match: (p) => p.startsWith("/admin/suppliers/merchandiser"),
  },
  {
    href: "/admin/suppliers/import-queue",
    label: "Importkø",
    icon: ListOrdered,
    match: (p) => p.startsWith("/admin/suppliers/import-queue"),
  },
  {
    href: "/admin/suppliers/health",
    label: "Leverandørstatus",
    icon: Activity,
    match: (p) => p.startsWith("/admin/suppliers/health") || p.startsWith("/admin/suppliers/sync"),
  },
  {
    href: "/admin/suppliers/workers",
    label: "Importmotor",
    icon: Cpu,
    match: (p) => p.startsWith("/admin/suppliers/workers"),
  },
  {
    href: "/admin/suppliers/logs",
    label: "Logger",
    icon: ScrollText,
    match: (p) => p.startsWith("/admin/suppliers/logs"),
  },
  {
    href: "/admin/suppliers/settings",
    label: "Innstillinger",
    icon: Settings,
    match: (p) => p.startsWith("/admin/suppliers/settings"),
  },
];

/** Top tabs for leverandørflaten — samme språk som sidemenyen. */
export function SupplierEngineTabs() {
  const pathname = usePathname() || "";

  return (
    <nav
      aria-label="Leverandører"
      className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon size={16} strokeWidth={1.75} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
