"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  LogOut,
  CheckCircle2,
  Tags,
  Truck,
  ListOrdered,
  Activity,
  Cpu,
  ScrollText,
  Settings,
  Sparkles,
  Brain,
  Bot,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";

/**
 * Admin navigation — Norwegian labels, Rob's Desk first.
 * No dead links. Supplier children match SupplierEngineTabs.
 */
const navItems = [
  { icon: LayoutDashboard, label: "Rob’s Desk", href: "/admin/dashboard" },
  { icon: ShoppingCart, label: "Ordrer", href: "/admin/orders" },
  { icon: Package, label: "Produkter", href: "/admin/products" },
  { icon: Users, label: "Kunder", href: "/admin/customers" },
  {
    icon: Truck,
    label: "Leverandører",
    href: "/admin/suppliers",
    children: [
      { icon: LayoutDashboard, label: "Oversikt", href: "/admin/suppliers" },
      { icon: Sparkles, label: "Finn produkter", href: "/admin/suppliers/merchandiser" },
      { icon: ListOrdered, label: "Importkø", href: "/admin/suppliers/import-queue" },
      { icon: Activity, label: "Leverandørstatus", href: "/admin/suppliers/health" },
      { icon: Cpu, label: "Importmotor", href: "/admin/suppliers/workers" },
      { icon: ScrollText, label: "Logger", href: "/admin/suppliers/logs" },
      { icon: Settings, label: "Innstillinger", href: "/admin/suppliers/settings" },
    ],
  },
  { icon: ShoppingBag, label: "Produktkjøper", href: "/admin/buyer" },
  { icon: Brain, label: "Butikkinnsikt", href: "/admin/intelligence" },
  { icon: Bot, label: "Autonomi", href: "/admin/autonomy" },
  { icon: ShieldCheck, label: "AI-tillit", href: "/admin/trust" },
  { icon: Tags, label: "Priskontroll", href: "/admin/products/pricing-audit" },
  { icon: CheckCircle2, label: "Variantkontroll", href: "/admin/products/variant-qa" },
] as const;

function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (href === "/admin/products") {
    if (!pathname.startsWith("/admin/products/")) return false;
    if (pathname.startsWith("/admin/products/pricing-audit")) return false;
    if (pathname.startsWith("/admin/products/variant-qa")) return false;
    if (pathname.startsWith("/admin/products/category-audit")) return false;
    return true;
  }
  if (href === "/admin/suppliers") {
    return pathname === "/admin/suppliers" || pathname.startsWith("/admin/suppliers/");
  }
  return pathname.startsWith(`${href}/`);
}

function isChildActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/admin/suppliers") return pathname === "/admin/suppliers";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col bg-slate-900 text-white lg:w-64">
      <div className="border-b border-slate-800 px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          ElectroHypeX
        </p>
        <h1 className="mt-0.5 text-lg font-bold tracking-tight">Kontrollrom</h1>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="Hovedmeny">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavActive(pathname, item.href);
          const showChildren =
            "children" in item && item.children && isNavActive(pathname, item.href);

          return (
            <div key={item.href} className="space-y-0.5">
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive && !showChildren
                    ? "bg-emerald-600 text-white"
                    : isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
              {showChildren ? (
                <div className="ml-2 space-y-0.5 border-l border-slate-700 py-0.5 pl-2">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isChildActive(pathname, child.href);
                    return (
                      <Link
                        key={child.href + child.label}
                        href={child.href}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                          childActive
                            ? "bg-emerald-600 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <ChildIcon size={14} strokeWidth={1.75} />
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={18} />
          <span>Logg ut</span>
        </button>
      </div>
    </aside>
  );
}
