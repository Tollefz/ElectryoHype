import Link from 'next/link';
import { Mail, Phone, MessageCircle, Clock, HelpCircle, Package, Truck, RotateCcw } from 'lucide-react';
import { SITE_CONFIG } from '@/lib/site';

export default function KundeservicePage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Kundeservice</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-dark">Kundeservice</h1>
          <p className="text-lg text-gray-medium">
            Vi er her for å hjelpe deg! Få svar på spørsmålene dine eller kontakt oss.
          </p>
        </div>

        {/* Kontakt-options */}
        <div className="mb-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 text-center shadow-sm">
            <Phone className="mx-auto mb-4 h-12 w-12 text-brand" />
            <h3 className="mb-2 font-bold text-dark">Ring oss</h3>
            <p className="mb-4 text-sm text-gray-medium">Man-Fre: 09:00 - 18:00</p>
            <a href={`tel:${SITE_CONFIG.supportPhoneTel}`} className="text-lg font-semibold text-brand hover:underline">
              {SITE_CONFIG.supportPhoneDisplay}
            </a>
          </div>

          <div className="rounded-xl bg-white p-6 text-center shadow-sm">
            <Mail className="mx-auto mb-4 h-12 w-12 text-brand" />
            <h3 className="mb-2 font-bold text-dark">E-post</h3>
            <p className="mb-4 text-sm text-gray-medium">Svar innen 24 timer</p>
            <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-lg font-semibold text-brand hover:underline">
              {SITE_CONFIG.supportEmail}
            </a>
          </div>

          <div className="rounded-xl bg-white p-6 text-center shadow-sm">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 text-brand" />
            <h3 className="mb-2 font-bold text-dark">Chat</h3>
            <p className="mb-4 text-sm text-gray-medium">Direkte hjelp nå</p>
            <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors">
              Start chat
            </button>
          </div>
        </div>

        {/* FAQ */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-brand" />
            <h2 className="text-2xl font-bold text-dark">Ofte stilte spørsmål</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold text-dark">Hvor lang leveringstid har dere?</h3>
              <p className="text-gray-medium">
                Ordrene behandles manuelt etter betaling. Estimert leveringstid: 5–12 virkedager fra ordrebehandling. Gratis frakt over 500,-!
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-dark">Kan jeg returnere produkter?</h3>
              <p className="text-gray-medium">
                Ja, du har 30 dagers åpent kjøp på alle produkter. Produktet må være ubrukt og i original emballasje.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-dark">Hvilke betalingsmetoder aksepterer dere?</h3>
              <p className="text-gray-medium">
                Vi aksepterer kortbetaling via Stripe (Visa, Mastercard). Alle betalinger er sikre og krypterte.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-dark">Har dere garanti på produktene?</h3>
              <p className="text-gray-medium">
                Ja, alle produktene har 2 års garanti. Kontakt oss hvis du opplever problemer.
              </p>
            </div>
          </div>
        </section>

        {/* Hjelp-lenker */}
        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/faq"
            className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-lg"
          >
            <HelpCircle className="h-8 w-8 flex-shrink-0 text-brand" />
            <div>
              <h3 className="font-bold text-dark">Ofte stilte spørsmål</h3>
              <p className="text-sm text-gray-medium">Finn svar på vanlige spørsmål</p>
            </div>
          </Link>

          <Link
            href="/retur"
            className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-lg"
          >
            <RotateCcw className="h-8 w-8 flex-shrink-0 text-brand" />
            <div>
              <h3 className="font-bold text-dark">Retur & Bytte</h3>
              <p className="text-sm text-gray-medium">Hvordan returnere eller bytte produkter</p>
            </div>
          </Link>

          <Link
            href="/frakt"
            className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-lg"
          >
            <Truck className="h-8 w-8 flex-shrink-0 text-brand" />
            <div>
              <h3 className="font-bold text-dark">Frakt & Levering</h3>
              <p className="text-sm text-gray-medium">Informasjon om levering og frakt</p>
            </div>
          </Link>

          <Link
            href="/garanti"
            className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-lg"
          >
            <Package className="h-8 w-8 flex-shrink-0 text-brand" />
            <div>
              <h3 className="font-bold text-dark">Garanti</h3>
              <p className="text-sm text-gray-medium">Informasjon om garantien vår</p>
            </div>
          </Link>
        </section>

        {/* Åpningstider */}
        <section className="mt-12 rounded-xl bg-brand-light p-8">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-brand" />
            <h2 className="text-xl font-bold text-dark">Åpningstider</h2>
          </div>
          <div className="mt-4 space-y-2 text-gray-medium">
            <div className="flex justify-between">
              <span>Mandag - Fredag:</span>
              <span className="font-semibold text-dark">09:00 - 18:00</span>
            </div>
            <div className="flex justify-between">
              <span>Lørdag:</span>
              <span className="font-semibold text-dark">10:00 - 16:00</span>
            </div>
            <div className="flex justify-between">
              <span>Søndag:</span>
              <span className="font-semibold text-dark">Stengt</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

