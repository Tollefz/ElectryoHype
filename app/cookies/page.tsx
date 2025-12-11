import Link from 'next/link';
import { Cookie, Settings, Eye, Shield } from 'lucide-react';

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Cookies</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <Cookie className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Informasjon om cookies</h1>
          <p className="text-lg text-gray-medium">
            Sist oppdatert: {new Date().toLocaleDateString('no-NO', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Innhold */}
        <section className="mb-8 space-y-8 rounded-xl bg-white p-8 shadow-sm">
          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Hva er cookies?</h2>
            <p className="mb-4 text-gray-medium">
              Cookies er små tekstfiler som lagres på din datamaskin eller mobilenhet når du besøker vår nettside.
              Cookies hjelper oss å gi deg en bedre opplevelse og forbedre våre tjenester.
            </p>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Settings className="h-6 w-6 text-brand" />
              <h3 className="text-xl font-bold text-dark">Hvilke cookies bruker vi?</h3>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-border p-4">
                <h4 className="mb-2 font-semibold text-dark">Nødvendige cookies</h4>
                <p className="text-gray-medium">
                  Disse cookies er nødvendige for at nettsiden skal fungere. De brukes for å huske handlekurven din og
                  håndtere betalinger.
                </p>
              </div>
              <div className="rounded-lg border border-gray-border p-4">
                <h4 className="mb-2 font-semibold text-dark">Funksjonelle cookies</h4>
                <p className="text-gray-medium">
                  Disse cookies lar oss huske dine preferanser og gi deg en mer personalisert opplevelse.
                </p>
              </div>
              <div className="rounded-lg border border-gray-border p-4">
                <h4 className="mb-2 font-semibold text-dark">Analytiske cookies</h4>
                <p className="text-gray-medium">
                  Vi bruker analytiske cookies for å forstå hvordan besøkende bruker nettsiden vår og forbedre våre tjenester.
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Eye className="h-6 w-6 text-brand" />
              <h3 className="text-xl font-bold text-dark">Hvordan administrere cookies</h3>
            </div>
            <p className="mb-4 text-gray-medium">
              Du kan når som helst slette cookies fra nettleseren din. Dette kan påvirke funksjonaliteten på nettsiden.
              Du kan også endre innstillingene i nettleseren din for å blokkere visse typer cookies.
            </p>
          </div>
        </section>

        {/* Cookie-innstillinger */}
        <section className="rounded-xl bg-brand-light p-8">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand" />
            <h2 className="text-2xl font-bold text-dark">Dine cookie-innstillinger</h2>
          </div>
          <p className="mb-6 text-gray-medium">
            Du kan når som helst endre dine cookie-innstillinger ved å kontakte oss eller endre innstillingene i nettleseren din.
          </p>
        </section>
      </div>
    </main>
  );
}

