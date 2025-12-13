import Link from 'next/link';
import { Shield, Lock, Eye, FileText } from 'lucide-react';
import { SITE_CONFIG } from '@/lib/site';

export default function PersonvernPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Personvern</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <Shield className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Personvern</h1>
          <p className="text-lg text-gray-medium">
            Sist oppdatert: {new Date().toLocaleDateString('no-NO', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Innhold */}
        <section className="mb-8 space-y-8 rounded-xl bg-white p-8 shadow-sm">
          <div>
            <h2 className="mb-4 text-2xl font-bold text-dark">Dine personopplysninger</h2>
            <p className="mb-4 text-gray-medium">
              ElectroHypeX AS er behandlingsansvarlig for behandlingen av dine personopplysninger.
              Vi tar personvernet ditt på alvor og behandler personopplysningene dine i tråd med gjeldende personvernlovgivning.
            </p>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-6 w-6 text-brand" />
              <h3 className="text-xl font-bold text-dark">Hva vi samler inn</h3>
            </div>
            <p className="mb-4 text-gray-medium">
              Vi samler inn opplysninger som navn, e-postadresse, telefonnummer, leveringsadresse og betalingsinformasjon
              når du handler hos oss. Vi bruker også cookies for å forbedre din opplevelse på nettsiden.
            </p>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Eye className="h-6 w-6 text-brand" />
              <h3 className="text-xl font-bold text-dark">Hvordan vi bruker opplysningene</h3>
            </div>
            <p className="mb-4 text-gray-medium">
              Vi bruker personopplysningene dine til å behandle ordrer, levere produkter, kommunisere med deg om ordren din,
              og forbedre våre tjenester. Vi deler ikke opplysningene dine med tredjeparter uten ditt samtykke, unntatt
              når det er nødvendig for å levere våre tjenester (f.eks. transportører).
            </p>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-6 w-6 text-brand" />
              <h3 className="text-xl font-bold text-dark">Dine rettigheter</h3>
            </div>
            <p className="mb-4 text-gray-medium">
              Du har rett til innsyn, retting, sletting og å protestere mot behandlingen av personopplysningene dine.
              Du kan når som helst be om å få slettet dine personopplysninger ved å kontakte oss på {SITE_CONFIG.supportEmail}.
            </p>
          </div>
        </section>

        {/* Kontakt */}
        <section className="rounded-xl bg-brand-light p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-dark">Spørsmål om personvern?</h2>
          <p className="mb-6 text-gray-medium">
            Kontakt oss på <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-brand hover:underline">{SITE_CONFIG.supportEmail}</a>
          </p>
        </section>
      </div>
    </main>
  );
}

