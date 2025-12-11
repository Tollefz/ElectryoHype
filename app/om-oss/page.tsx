import Link from 'next/link';
import { Building2, Target, Users, Award } from 'lucide-react';

export default function OmOssPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Om oss</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <Building2 className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Om ElektroHype</h1>
          <p className="text-lg text-gray-medium">
            Din destinasjon for elektronikk, gaming og tech
          </p>
        </div>

        {/* Hovedseksjon */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Vår historie</h2>
          <div className="space-y-4 text-gray-medium">
            <p>
              ElektroHype ble grunnlagt med et enkelt mål: å gjøre det enkelt å kjøpe kvalitetselektronikk til gode priser.
            </p>
            <p>
              Vi er en moderne nettbutikk som spesialiserer oss på elektronikk, gaming-utstyr og tech-produkter.
              Med rask levering, 30 dagers åpent kjøp og 2 års garanti på alle produkter, sikrer vi at du får best mulig opplevelse.
            </p>
            <p>
              Vi jobber kontinuerlig med å utvide vårt sortiment og forbedre våre tjenester for å gi deg best mulig shopping-opplevelse.
            </p>
          </div>
        </section>

        {/* Verdier */}
        <section className="mb-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <Target className="mb-4 h-10 w-10 text-brand" />
            <h3 className="mb-2 text-xl font-bold text-dark">Vår visjon</h3>
            <p className="text-gray-medium">
              Å være Norges ledende nettbutikk for elektronikk og tech-produkter med fokus på kvalitet, service og kundetilfredshet.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <Users className="mb-4 h-10 w-10 text-brand" />
            <h3 className="mb-2 text-xl font-bold text-dark">Våre verdier</h3>
            <p className="text-gray-medium">
              Kundefokus, kvalitet, innovasjon og ærlighet er verdiene vi bygger vår bedrift på.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <Award className="mb-4 h-10 w-10 text-brand" />
            <h3 className="mb-2 text-xl font-bold text-dark">Kvalitet</h3>
            <p className="text-gray-medium">
              Vi selger kun produkter av høy kvalitet og tilbyr 2 års garanti på alt vi selger.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <Building2 className="mb-4 h-10 w-10 text-brand" />
            <h3 className="mb-2 text-xl font-bold text-dark">Lokalt eid</h3>
            <p className="text-gray-medium">
              ElektroHype er et norsk selskap med hovedkontor i Oslo. Vi forstår norske forbrukere.
            </p>
          </div>
        </section>

        {/* Kontaktinfo */}
        <section className="rounded-xl bg-brand-light p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-dark">Vil du vite mer?</h2>
          <p className="mb-6 text-gray-medium">
            Kontakt oss gjerne hvis du har spørsmål om ElektroHype
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/kontakt"
              className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
            >
              Kontakt oss
            </Link>
            <Link
              href="/kontakt"
              className="rounded-lg border-2 border-brand px-6 py-3 font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
            >
              Kontakt oss
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

