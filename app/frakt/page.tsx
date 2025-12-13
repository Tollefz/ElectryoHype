import Link from 'next/link';
import { Truck, Package, Clock, MapPin, CheckCircle } from 'lucide-react';

export default function FraktPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <Link href="/kundeservice" className="hover:text-brand">Kundeservice</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Frakt & Levering</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <Truck className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Frakt & Levering</h1>
          <p className="text-lg text-gray-medium">
            Rask og pålitelig levering til hele Norge
          </p>
        </div>

        {/* Gratis frakt */}
        <section className="mb-12 rounded-xl bg-brand-light p-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl text-white">
            🎁
          </div>
          <h2 className="mb-2 text-3xl font-bold text-dark">Gratis frakt over 500,-</h2>
          <p className="text-lg text-gray-medium">
            Bestiller du for mer enn 500,-, er frakten gratis!
          </p>
        </section>

        {/* Fraktpriser */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Fraktpriser</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-border p-4">
              <div>
                <h3 className="font-semibold text-dark">Gratis frakt</h3>
                <p className="text-sm text-gray-medium">For ordre over 500,-</p>
              </div>
              <span className="text-2xl font-bold text-brand">0 kr</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-border p-4">
              <div>
                <h3 className="font-semibold text-dark">Standard frakt</h3>
                <p className="text-sm text-gray-medium">For ordre under 500,-</p>
              </div>
              <span className="text-2xl font-bold text-dark">79 kr</span>
            </div>
          </div>
        </section>

        {/* Leveringstider */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <Clock className="h-6 w-6 text-brand" />
            <h2 className="text-2xl font-bold text-dark">Leveringstider</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-border p-4">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-brand" />
                <h3 className="font-semibold text-dark">5–12 virkedager</h3>
              </div>
              <p className="text-gray-medium">
                Estimert leveringstid fra ordrebehandling. Ordrene behandles manuelt etter betaling.
              </p>
            </div>
            <div className="rounded-lg border border-gray-border p-4">
              <div className="mb-2 flex items-center gap-2">
                <Package className="h-5 w-5 text-brand" />
                <h3 className="font-semibold text-dark">Manuell behandling</h3>
              </div>
              <p className="text-gray-medium">
                Alle ordrer behandles manuelt av ElectroHypeX. Du mottar sporingsinformasjon når pakken er sendt.
              </p>
            </div>
          </div>
        </section>

        {/* Sporing */}
        <section className="mb-12 rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Spor din ordre</h2>
          <p className="mb-4 text-gray-medium">
            Når ordren din er sendt, mottar du en e-post med sporekode. Du kan følge sporingen på transportørens nettside.
          </p>
          <div className="flex items-center gap-4 rounded-lg bg-gray-light p-4">
            <MapPin className="h-6 w-6 text-brand" />
            <div>
              <p className="font-semibold text-dark">Transportører vi bruker:</p>
              <p className="text-sm text-gray-medium">Posten, PostNord, Bring</p>
            </div>
          </div>
        </section>

        {/* Leveringsadresse */}
        <section className="rounded-xl bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-dark">Levering til</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <MapPin className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Hele Norge</h3>
                <p className="text-gray-medium">
                  Vi leverer til alle adresser i Norge, inkludert postkontorer og utleveringssteder.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Package className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <h3 className="font-semibold text-dark">Postkontor / Utleveringssted</h3>
                <p className="text-gray-medium">
                  Du kan velge å hente pakken på nærmeste postkontor eller utleveringssted.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

