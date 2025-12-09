import Link from 'next/link';
import { Shield, CheckCircle, Clock, Phone, Mail } from 'lucide-react';

export default function GarantiPage() {
  return (
    <main className="min-h-screen bg-gray-light py-12">
      <div className="mx-auto max-w-4xl px-4">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <Link href="/kundeservice" className="hover:text-brand">Kundeservice</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Garanti</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <Shield className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Garanti</h1>
          <p className="text-lg text-gray-medium">
            2 års garanti på alle produkter i henhold til norsk forbrukerkjøpslov
          </p>
        </div>

        {/* Garantioversikt */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Din garanti</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-gray-border p-6">
              <Clock className="mb-4 h-8 w-8 text-brand" />
              <h3 className="mb-2 font-semibold text-dark">2 års garanti</h3>
              <p className="text-gray-medium">
                Alle produktene våre har 2 års garanti i henhold til forbrukerkjøpsloven.
              </p>
            </div>
            <div className="rounded-lg border border-gray-border p-6">
              <CheckCircle className="mb-4 h-8 w-8 text-brand" />
              <h3 className="mb-2 font-semibold text-dark">Full dekning</h3>
              <p className="text-gray-medium">
                Garantien dekker feil og mangler som oppstår under normal bruk av produktet.
              </p>
            </div>
          </div>
        </section>

        {/* Hva dekkes */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Hva dekkes av garantien?</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Feil og mangler</h3>
                <p className="text-gray-medium">
                  Produktfeil, fabrikasjonsfeil og mangler som oppstår uten at du har påført skade.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Defekter under normal bruk</h3>
                <p className="text-gray-medium">
                  Problemer som oppstår når produktet brukes på forventet måte.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Funksjonsfeil</h3>
                <p className="text-gray-medium">
                  Når produktet ikke fungerer som spesifisert eller annonsert.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Hva dekkes IKKE */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Hva dekkes ikke?</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="mt-1 h-6 w-6 flex-shrink-0 rounded-full border-2 border-gray-medium" />
              <div>
                <h3 className="font-semibold text-dark">Slitasje</h3>
                <p className="text-gray-medium">
                  Normal slitasje som følge av bruk er ikke dekket av garantien.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-1 h-6 w-6 flex-shrink-0 rounded-full border-2 border-gray-medium" />
              <div>
                <h3 className="font-semibold text-dark">Skade fra uhell</h3>
                <p className="text-gray-medium">
                  Skade som følge av fall, vannskade eller annen uhell er ikke dekket.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-1 h-6 w-6 flex-shrink-0 rounded-full border-2 border-gray-medium" />
              <div>
                <h3 className="font-semibold text-dark">Egenreparasjoner</h3>
                <p className="text-gray-medium">
                  Produkter som har blitt åpnet eller reparert uten autorisasjon.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Hvordan reklamere */}
        <section className="mb-12 rounded-xl bg-brand-light p-8">
          <h2 className="mb-6 text-2xl font-bold text-dark">Hvordan reklamerer jeg?</h2>
          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                1
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Kontakt oss</h3>
                <p className="text-gray-medium">
                  Ta kontakt med kundeservice og beskriv problemet. Ha med ordrenummer og kvittering.
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                2
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Vi vurderer saken</h3>
                <p className="text-gray-medium">
                  Vi vurderer om produktet er dekket av garantien. Vi kan be om bilder eller at du sender produktet inn.
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                3
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Løsning</h3>
                <p className="text-gray-medium">
                  Vi tilbyr reparasjon, bytte eller refusjon avhengig av situasjonen.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Kontakt */}
        <section className="rounded-xl bg-white p-8 shadow-sm text-center">
          <h2 className="mb-4 text-2xl font-bold text-dark">Har du et garanti-issue?</h2>
          <p className="mb-6 text-gray-medium">
            Ta kontakt med oss så hjelper vi deg videre
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="mailto:hei@elektrohype.no"
              className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
            >
              <Mail size={20} />
              Send e-post
            </a>
            <a
              href="tel:+4722334455"
              className="flex items-center gap-2 rounded-lg border-2 border-brand px-6 py-3 font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
            >
              <Phone size={20} />
              Ring oss
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

