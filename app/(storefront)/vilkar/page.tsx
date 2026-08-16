import Link from 'next/link';
import { FileText } from 'lucide-react';
import { SITE_CONFIG } from '@/lib/site';

export default function VilkarPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Vilkår og betingelser</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <FileText className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Vilkår og betingelser</h1>
          <p className="text-lg text-gray-medium">
            Sist oppdatert: {new Date().toLocaleDateString('no-NO', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Innhold */}
        <section className="mb-8 space-y-8 rounded-xl bg-white p-8 shadow-sm">
          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Generelt</h2>
            <p className="text-gray-medium">
              Ved å handle hos ElectroHypeX aksepterer du våre vilkår og betingelser. Disse vilkårene gjelder for alle kjøp
              gjort gjennom vår nettbutikk.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Bestilling og betaling</h2>
            <p className="mb-4 text-gray-medium">
              Når du legger inn en ordre, aksepterer du å kjøpe produktet til den angitte prisen. Vi forbeholder oss retten til
              å avvise ordrer eller korrigere priser ved feil i våre priser.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Levering</h2>
            <p className="mb-4 text-gray-medium">
              Vi leverer til hele Norge. Ordrene behandles manuelt etter betaling. Estimert leveringstid: 5–12 virkedager fra ordrebehandling. Vi er ikke ansvarlige
              for forsinkelser utenfor vår kontroll.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Returrett og angrerett</h2>
            <p className="mb-4 text-gray-medium">
              <strong>Angrerett (14 dager):</strong> I henhold til forbrukerkjøpsloven har du 14 dagers angrerett på kjøp gjort på nett. Dette er en juridisk rettighet som betyr at du kan returnere produktet innen 14 dager uten å oppgi grunn, så lenge produktet er ubrukt og i original emballasje.
            </p>
            <p className="mb-4 text-gray-medium">
              <strong>Reklamasjon:</strong> I henhold til forbrukerkjøpsloven har du rett til reklamasjon ved feil og mangler. Produktet skal være i samsvar med det som er lovet og forventet ved kjøp.
            </p>
            <p className="mb-4 text-gray-medium">
              <strong>Åpent kjøp (30 dager):</strong> I tillegg til dine juridiske rettigheter, tilbyr vi 30 dagers åpent kjøp på alle produkter. Dette er vår frivillige butikkpolicy og gir deg ekstra tid til å teste produktet.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Garanti</h2>
            <p className="mb-4 text-gray-medium">
              Alle produkter har 2 års garanti i henhold til forbrukerkjøpsloven. Garantien dekker feil og mangler som oppstår
              under normal bruk av produktet.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Ansvarsbegrensning</h2>
            <p className="mb-4 text-gray-medium">
              ElectroHypeX er ikke ansvarlig for skader som følge av feil bruk av produktet. Vårt ansvar er begrenset til produktets verdi.
            </p>
          </div>
        </section>

        {/* Kontakt */}
        <section className="rounded-xl bg-brand-light p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-dark">Spørsmål om vilkårene?</h2>
          <p className="mb-6 text-gray-medium">
            Kontakt oss på <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-brand hover:underline">{SITE_CONFIG.supportEmail}</a>
          </p>
        </section>
      </div>
    </main>
  );
}

