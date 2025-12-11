import Link from 'next/link';
import { RotateCcw, Mail, Phone, Package, CheckCircle } from 'lucide-react';

export default function ReturPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <Link href="/kundeservice" className="hover:text-brand">Kundeservice</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Retur & Bytte</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <RotateCcw className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Retur & Bytte</h1>
          <p className="text-lg text-gray-medium">
            Du har 30 dagers åpent kjøp på alle produkter
          </p>
        </div>

        {/* Returrett */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Din returrett</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">30 dagers åpent kjøp</h3>
                <p className="text-gray-medium">
                  Du kan returnere produktet innen 30 dager uten å oppgi grunn.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Produktet må være ubrukt</h3>
                <p className="text-gray-medium">
                  Produktet må være i original emballasje og ubrukt for at returen skal godkjennes.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Ta vare på kvitteringen</h3>
                <p className="text-gray-medium">
                  Du trenger kvittering eller ordrenummer for å returnere produktet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Slik returnerer du */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Slik returnerer du</h2>
          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                1
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Kontakt oss</h3>
                <p className="text-gray-medium">
                  Send e-post til <a href="mailto:hei@elektrohype.no" className="text-brand hover:underline">hei@elektrohype.no</a> eller ring +47 22 33 44 55. Oppgi ordrenummer.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                2
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Vi sender returetikett</h3>
                <p className="text-gray-medium">
                  Vi sender deg en returetikett som du kan skrive ut og feste på pakken.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                3
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Send produktet</h3>
                <p className="text-gray-medium">
                  Pakk produktet i original emballasje og lever til Posten eller nærmeste utleveringssted.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
                4
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-dark">Refusjon</h3>
                <p className="text-gray-medium">
                  Vi refunderer beløpet til samme betalingsmetode innen 5-10 virkedager etter at vi har mottatt produktet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Viktig informasjon */}
        <section className="rounded-xl bg-brand-light p-8">
          <Package className="mb-4 h-8 w-8 text-brand" />
          <h2 className="mb-4 text-2xl font-bold text-dark">Viktig å vite</h2>
          <ul className="space-y-2 text-gray-medium">
            <li>• Produktet må sendes i original emballasje</li>
            <li>• Alle deler og dokumentasjon må følge med</li>
            <li>• Returfrakt dekkes av kunden ved vanlig retur</li>
            <li>• Ved feil/defekt produkt dekker vi returfrakten</li>
            <li>• Refusjon skjer til samme betalingsmetode som kjøpet</li>
          </ul>
        </section>

        {/* Kontakt */}
        <section className="mt-12 rounded-xl bg-white p-8 shadow-sm text-center">
          <h2 className="mb-4 text-2xl font-bold text-dark">Trenger du hjelp?</h2>
          <p className="mb-6 text-gray-medium">
            Kontakt oss gjerne hvis du har spørsmål om retur
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

