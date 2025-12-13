import Link from 'next/link';
import { Facebook, Instagram, Youtube, Twitter, Mail, Phone, MapPin } from 'lucide-react';
import { CONTACT_INFO } from '@/lib/contact';

export function Footer() {
  return (
    <footer className="bg-[#F3F4F6]">
      {/* Hovedfooter */}
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-12 sm:py-10">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          
          {/* 1. Kundeservice */}
          <div>
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Kundeservice
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li><Link href="/kontakt" className="hover:text-green-600 transition-colors">Kontakt oss</Link></li>
              <li><Link href="/faq" className="hover:text-green-600 transition-colors">Ofte stilte spørsmål</Link></li>
              <li><Link href="/retur" className="hover:text-green-600 transition-colors">Retur & Bytte</Link></li>
              <li><Link href="/frakt" className="hover:text-green-600 transition-colors">Frakt & Levering</Link></li>
              <li><Link href="/garanti" className="hover:text-green-600 transition-colors">Garanti</Link></li>
            </ul>
            <div className="mt-4 space-y-2 text-sm">
              <a href={`mailto:${CONTACT_INFO.email}`} className="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors">
                <Mail size={16} />
                <span>{CONTACT_INFO.email}</span>
              </a>
              <a href={CONTACT_INFO.phoneLink} className="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors">
                <Phone size={16} />
                <span>{CONTACT_INFO.phone}</span>
              </a>
            </div>
          </div>

          {/* 2. Informasjon */}
          <div>
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Informasjon
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li><Link href="/personvern" className="hover:text-green-600 transition-colors">Personvern</Link></li>
              <li><Link href="/cookies" className="hover:text-green-600 transition-colors">Cookies</Link></li>
              <li><Link href="/vilkar" className="hover:text-green-600 transition-colors">Vilkår</Link></li>
              <li><Link href="/kundeservice" className="hover:text-green-600 transition-colors">Kundeservice</Link></li>
            </ul>
          </div>

          {/* 3. Kategorier */}
          <div>
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Kategorier
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li><Link href="/products?category=data" className="hover:text-green-600 transition-colors">Data & IT</Link></li>
              <li><Link href="/products?category=gaming" className="hover:text-green-600 transition-colors">Gaming</Link></li>
              <li><Link href="/products?category=mobil" className="hover:text-green-600 transition-colors">Mobil & Tilbehør</Link></li>
              <li><Link href="/products?category=tv" className="hover:text-green-600 transition-colors">TV, Lyd & Bilde</Link></li>
              <li><Link href="/products" className="hover:text-green-600 transition-colors">Se alle kategorier</Link></li>
            </ul>
          </div>

          {/* 4. Om oss */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
                <span className="text-xl font-black text-white">E</span>
              </div>
              <div>
                <span className="text-xl font-bold text-gray-900">Electro</span>
                <span className="text-xl font-bold text-green-600">HypeX</span>
              </div>
            </div>
            <p className="mb-4 text-sm text-gray-700">
              Din destinasjon for elektronikk, gaming og tech. 
              Vi leverer kvalitetsprodukter til konkurransedyktige priser 
              med rask levering i hele Norge.
            </p>
            <div className="mb-4 space-y-2 text-sm text-gray-700">
              <a href={`mailto:${CONTACT_INFO.email}`} className="block hover:text-green-600 transition-colors">
                {CONTACT_INFO.email}
              </a>
              <a href={CONTACT_INFO.phoneLink} className="block hover:text-green-600 transition-colors">
                {CONTACT_INFO.phone}
              </a>
            </div>
            <div className="flex gap-3">
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 hover:bg-green-600 hover:text-white transition-colors text-gray-700">
                <Facebook size={18} />
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 hover:bg-green-600 hover:text-white transition-colors text-gray-700">
                <Instagram size={18} />
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 hover:bg-green-600 hover:text-white transition-colors text-gray-700">
                <Youtube size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-gray-300 bg-gray-200">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="text-center text-sm text-gray-600">
            <p>© {new Date().getFullYear()} {CONTACT_INFO.brand} AS. Alle rettigheter reservert. Org.nr: 999 888 777 {/* TODO: Oppdater med ekte org.nr når tilgjengelig */}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
