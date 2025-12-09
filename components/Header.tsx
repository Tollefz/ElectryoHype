'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search, ShoppingCart, User, Menu, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { LogoV5 } from '@/components/Logo';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { itemCount } = useCart();

  const categories = [
    { name: 'Data & IT', href: '/products?category=data' },
    { name: 'TV, Lyd & Bilde', href: '/products?category=tv' },
    { name: 'Mobil & Tilbehør', href: '/products?category=mobil' },
    { name: 'Gaming', href: '/products?category=gaming' },
    { name: 'Hvitevarer', href: '/products?category=hvitevarer' },
    { name: 'Hjem & Fritid', href: '/products?category=hjem' },
    { name: 'Sport & Trening', href: '/products?category=sport' },
  ];

  return (
    <header className="sticky top-0 z-50">
      {/* Øverste linje - grønn */}
      <div className="bg-brand">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between py-1 text-xs text-white">
            <div className="flex items-center gap-4">
              <span>Fri frakt over 500,-</span>
              <span className="hidden md:inline">|</span>
              <span className="hidden md:inline">Rask levering 1-3 dager</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/kundeservice" className="hover:underline">Kundeservice</Link>
              <Link href="/admin/login" className="hover:underline">For bedrift</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Hovedheader - hvit */}
      <div className="border-b border-gray-border bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center gap-6 py-4">
            
            {/* Logo - LogoV5 (Elegant Monogram med Lyn) */}
            <Link href="/" className="flex-shrink-0">
              <LogoV5 />
            </Link>

            {/* ANDRE LOGO-ALTERNATIVER - Kommenter ut LogoV5 over og fjern kommentar for ønsket logo */}
            
            {/* LOGO 6 (Profesjonell med tagline) */}
            {/* 
            import { LogoV6 } from '@/components/Logo';
            <Link href="/" className="flex-shrink-0">
              <LogoV6 />
            </Link>
            */}

            {/* ORIGINAL LOGO (Minimalistisk E med lyn) */}
            {/* 
            <Link href="/" className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-brand">
                  <span className="text-xl font-black text-white">E</span>
                  <div className="absolute -right-1 -top-1 text-brand">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z"/>
                    </svg>
                  </div>
                </div>
                <div>
                  <span className="text-xl font-bold text-dark">Elektro</span>
                  <span className="text-xl font-bold text-brand">Hype</span>
                </div>
              </div>
            </Link>
            */}

            {/* Søkefelt - stort og sentrert */}
            <div className="flex-1 max-w-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
                  }
                }}
                className="relative"
              >
                <input
                  type="text"
                  placeholder="Søk blant produkter..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border-2 border-gray-border bg-white py-3 pl-5 pr-14 text-sm focus:border-brand focus:outline-none"
                />
                <button
                  type="submit"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-brand p-2.5 text-white hover:bg-brand-dark transition-colors"
                >
                  <Search size={20} />
                </button>
              </form>
            </div>

            {/* Høyre side - ikoner */}
            <div className="flex items-center gap-2">
              {/* Min konto */}
              <Link
                href="/admin/login"
                className="flex flex-col items-center rounded-lg px-3 py-2 hover:bg-gray-light transition-colors"
              >
                <User size={22} className="text-dark" />
                <span className="mt-1 text-xs text-gray-medium">Min konto</span>
              </Link>

              {/* Handlekurv */}
              <Link
                href="/cart"
                className="relative flex flex-col items-center rounded-lg px-3 py-2 hover:bg-gray-light transition-colors"
              >
                <div className="relative">
                  <ShoppingCart size={22} className="text-dark" />
                  {itemCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                      {itemCount}
                    </span>
                  )}
                </div>
                <span className="mt-1 text-xs text-gray-medium">Handlekurv</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Kategorinavigasjon - mørk */}
      <div className="bg-dark">
        <div className="mx-auto max-w-7xl px-4">
          <nav className="flex items-center">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden mr-2 p-2 text-white hover:text-brand transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Alle kategorier dropdown - Desktop */}
            <div className="relative group hidden lg:block">
              <button className="flex items-center gap-2 bg-dark-secondary px-5 py-3.5 font-medium text-white hover:bg-brand transition-colors">
                <Menu size={20} />
                <span>Alle kategorier</span>
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Kategori-lenker - Desktop */}
            <div className="hidden lg:flex items-center overflow-x-auto">
              {categories.map((category) => (
                <Link
                  key={category.name}
                  href={category.href}
                  className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-white hover:text-brand transition-colors"
                >
                  {category.name}
                </Link>
              ))}
            </div>

            {/* Kampanje-lenke */}
            <Link
              href="/tilbud"
              className="ml-auto flex items-center gap-1 px-4 py-3.5 text-sm font-bold text-brand hover:text-brand-dark transition-colors"
            >
              🔥 Ukens tilbud
            </Link>
          </nav>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-dark-secondary">
              <div className="py-2">
                {categories.map((category) => (
                  <Link
                    key={category.name}
                    href={category.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-3 text-sm font-medium text-white hover:bg-dark-secondary hover:text-brand transition-colors"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
