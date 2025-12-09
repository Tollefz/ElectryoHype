import Link from 'next/link';
import { Facebook, Instagram, Youtube, Twitter, Mail, Phone, MapPin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-dark text-white">
      {/* Hovedfooter */}
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          
          {/* Logo og info */}
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand">
                <span className="text-xl font-black text-white">E</span>
              </div>
              <div>
                <span className="text-xl font-bold text-white">Elektro</span>
                <span className="text-xl font-bold text-brand">Hype</span>
              </div>
            </div>
            <p className="mb-4 text-sm text-gray-400">
              Din destinasjon for elektronikk, gaming og tech. 
              Vi leverer kvalitetsprodukter til konkurransedyktige priser 
              med rask levering i hele Norge.
            </p>
            <div className="flex gap-3">
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-secondary hover:bg-brand transition-colors">
                <Facebook size={18} />
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-secondary hover:bg-brand transition-colors">
                <Instagram size={18} />
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-secondary hover:bg-brand transition-colors">
                <Youtube size={18} />
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-secondary hover:bg-brand transition-colors">
                <Twitter size={18} />
              </a>
            </div>
          </div>

          {/* Kundeservice */}
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-brand">
              Kundeservice
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/kontakt" className="text-gray-400 hover:text-white transition-colors">Kontakt oss</Link></li>
              <li><Link href="/faq" className="text-gray-400 hover:text-white transition-colors">Ofte stilte spørsmål</Link></li>
              <li><Link href="/retur" className="text-gray-400 hover:text-white transition-colors">Retur & Bytte</Link></li>
              <li><Link href="/frakt" className="text-gray-400 hover:text-white transition-colors">Frakt & Levering</Link></li>
              <li><Link href="/garanti" className="text-gray-400 hover:text-white transition-colors">Garanti</Link></li>
            </ul>
          </div>

          {/* Om oss */}
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-brand">
              Om ElektroHype
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/om-oss" className="text-gray-400 hover:text-white transition-colors">Om oss</Link></li>
              <li><Link href="/karriere" className="text-gray-400 hover:text-white transition-colors">Jobb hos oss</Link></li>
              <li><Link href="/presse" className="text-gray-400 hover:text-white transition-colors">Presse</Link></li>
              <li><Link href="/bedrift" className="text-gray-400 hover:text-white transition-colors">For bedrifter</Link></li>
              <li><Link href="/affiliate" className="text-gray-400 hover:text-white transition-colors">Affiliate</Link></li>
            </ul>
          </div>

          {/* Kontakt */}
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-brand">
              Kontakt
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2 text-gray-400">
                <Phone size={16} className="text-brand" />
                +47 22 33 44 55
              </li>
              <li className="flex items-center gap-2 text-gray-400">
                <Mail size={16} className="text-brand" />
                hei@elektrohype.no
              </li>
              <li className="flex items-start gap-2 text-gray-400">
                <MapPin size={16} className="mt-0.5 text-brand" />
                <span>Teknologiveien 1<br/>0150 Oslo</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Betalingsmetoder */}
      <div className="border-t border-dark-secondary">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-sm text-gray-400">Trygge betalingsmetoder:</p>
            <div className="flex items-center gap-4">
              <div className="rounded bg-white px-3 py-1.5 text-xs font-bold text-dark">VISA</div>
              <div className="rounded bg-white px-3 py-1.5 text-xs font-bold text-dark">Mastercard</div>
              <div className="rounded bg-[#ff5b24] px-3 py-1.5 text-xs font-bold text-white">Vipps</div>
              <div className="rounded bg-[#ffb3c7] px-3 py-1.5 text-xs font-bold text-dark">Klarna</div>
              <div className="rounded bg-[#003087] px-3 py-1.5 text-xs font-bold text-white">PayPal</div>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-dark-secondary bg-black">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-col items-center justify-between gap-4 text-xs text-gray-500 md:flex-row">
            <p>© {new Date().getFullYear()} ElektroHype AS. Alle rettigheter reservert. Org.nr: 999 888 777</p>
            <div className="flex gap-4">
              <Link href="/personvern" className="hover:text-white transition-colors">Personvern</Link>
              <Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link>
              <Link href="/vilkar" className="hover:text-white transition-colors">Vilkår</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
