"use client";

import Link from "next/link";
import { Search, ShoppingCart, User, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { LogoV5 } from "@/components/Logo";
import { CATEGORY_DEFINITIONS, getAllCategorySlugs } from "@/lib/categories";
import { SITE_CONFIG } from "@/lib/site";

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { itemCount } = useCart();

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeCategory = searchParams.get("category");

  const categories = getAllCategorySlugs().map((slug) => ({
    name: CATEGORY_DEFINITIONS[slug].label,
    href: `/products?category=${slug}`,
    slug,
  }));

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white">
      <div className="bg-[var(--brand)]">
        <div className="ehx-container">
          <div className="flex items-center justify-between gap-4 py-1.5 text-[11px] text-white sm:text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="whitespace-nowrap">
                Fri frakt over {SITE_CONFIG.freeShippingThreshold},-
              </span>
              <span className="hidden text-white/80 sm:inline">·</span>
              <span className="hidden whitespace-nowrap sm:inline">
                {SITE_CONFIG.deliveryPromise}
              </span>
              <span className="hidden text-white/80 md:inline">·</span>
              <span className="hidden whitespace-nowrap md:inline">
                30 dagers åpent kjøp
              </span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/kundeservice"
                className="whitespace-nowrap text-white transition hover:underline"
              >
                Kundeservice
              </Link>
              <Link
                href="/om-oss"
                className="hidden whitespace-nowrap text-white transition hover:underline sm:inline"
              >
                Om oss
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--border)] bg-white">
        <div className="ehx-container">
          <div className="flex items-center justify-between gap-3 py-3.5 lg:hidden">
            <Link href="/" className="shrink-0">
              <LogoV5 />
            </Link>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="flex flex-1 items-center gap-2 rounded-[var(--ehx-radius-md)] border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--text-muted)]"
            >
              <Search size={17} />
              <span>Søk produkter…</span>
            </button>
            <Link
              href="/cart"
              className="relative flex items-center justify-center rounded-[var(--ehx-radius-md)] p-2.5 transition hover:bg-slate-50"
              aria-label="Handlekurv"
            >
              <ShoppingCart size={22} className="text-[var(--text)]" />
              {mounted && itemCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-white">
                  {itemCount}
                </span>
              ) : null}
            </Link>
          </div>

          {mobileSearchOpen ? (
            <div className="border-t border-[var(--border)] py-3 lg:hidden">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    router.push(
                      `/products?q=${encodeURIComponent(searchQuery.trim())}`
                    );
                    setMobileSearchOpen(false);
                  }
                }}
                className="relative"
              >
                <input
                  type="search"
                  placeholder="Søk blant produkter…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-[var(--ehx-radius-md)] border border-[var(--border-strong)] bg-white py-3 pl-4 pr-14 text-sm outline-none transition focus:border-[var(--brand)]"
                  autoFocus
                />
                <button
                  type="submit"
                  className="ehx-btn ehx-btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5"
                  aria-label="Søk"
                >
                  <Search size={18} />
                </button>
              </form>
            </div>
          ) : null}

          <div className="hidden items-center gap-8 py-5 lg:flex">
            <Link href="/" className="shrink-0">
              <LogoV5 />
            </Link>

            <div className="mx-auto w-full max-w-2xl flex-1">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    router.push(
                      `/products?q=${encodeURIComponent(searchQuery.trim())}`
                    );
                  }
                }}
                className="relative"
              >
                <input
                  type="search"
                  placeholder="Søk blant produkter…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-[var(--ehx-radius-md)] border border-[var(--border-strong)] bg-[var(--surface-muted)] py-3.5 pl-5 pr-16 text-sm outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:bg-white focus:shadow-[var(--ehx-shadow-sm)]"
                />
                <button
                  type="submit"
                  className="ehx-btn ehx-btn-primary absolute right-1.5 top-1/2 h-[calc(100%-0.75rem)] -translate-y-1/2 rounded-[var(--ehx-radius-sm)] px-4"
                  aria-label="Søk"
                >
                  <Search size={18} />
                </button>
              </form>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/kundeservice"
                className="flex flex-col items-center rounded-[var(--ehx-radius-md)] px-3 py-2 transition hover:bg-slate-50"
              >
                <User size={20} className="text-[var(--text)]" />
                <span className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  Kundeservice
                </span>
              </Link>
              <Link
                href="/cart"
                className="relative flex flex-col items-center rounded-[var(--ehx-radius-md)] px-3 py-2 transition hover:bg-slate-50"
              >
                <div className="relative">
                  <ShoppingCart size={20} className="text-[var(--text)]" />
                  {mounted && itemCount > 0 ? (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-white">
                      {itemCount}
                    </span>
                  ) : null}
                </div>
                <span className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  Handlekurv
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--navy)]">
        <div className="ehx-container">
          <nav className="flex items-center" aria-label="Hovedkategorier">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mr-2 rounded-[var(--ehx-radius-sm)] p-2.5 text-white transition hover:bg-white/10 lg:hidden"
              aria-label={mobileMenuOpen ? "Lukk meny" : "Åpne meny"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <div className="hidden items-center gap-0.5 overflow-x-auto py-1.5 lg:flex">
              {categories.map((category) => {
                const isActive = activeCategory === category.slug;
                return (
                  <Link
                    key={category.slug}
                    href={category.href}
                    className={`whitespace-nowrap rounded-[var(--ehx-radius-sm)] px-3.5 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-[var(--brand)] text-white"
                        : "text-white hover:bg-white/10"
                    }`}
                  >
                    {category.name}
                  </Link>
                );
              })}
            </div>

            <Link
              href="/tilbud"
            className="ml-auto whitespace-nowrap px-3.5 py-3 text-sm font-bold text-red-300 transition hover:text-red-200"
            >
              Tilbud
            </Link>
          </nav>

          {mobileMenuOpen ? (
            <div className="border-t border-white/10 py-2 lg:hidden">
              {categories.map((category) => {
                const isActive = activeCategory === category.slug;
                return (
                  <Link
                    key={category.slug}
                    href={category.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block rounded-[var(--ehx-radius-sm)] px-3 py-3 text-sm font-medium ${
                      isActive
                        ? "bg-[var(--brand)] text-white"
                        : "text-white hover:bg-white/10"
                    }`}
                  >
                    {category.name}
                  </Link>
                );
              })}
              <Link
                href="/tilbud"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-3 text-sm font-bold text-red-400"
              >
                Tilbud
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
