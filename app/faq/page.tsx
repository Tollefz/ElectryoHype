import Link from 'next/link';
import { ChevronDown, HelpCircle } from 'lucide-react';

export default function FAQPage() {
  const faqs = [
    {
      category: 'Ordre og betaling',
      questions: [
        {
          q: 'Hvilke betalingsmetoder aksepterer dere?',
          a: 'Vi aksepterer Visa, Mastercard, Vipps, Klarna og PayPal. Alle betalinger er sikre og krypterte.',
        },
        {
          q: 'Kan jeg betale med delbetaling?',
          a: 'Ja, du kan velge Klarna ved kassen for å betale med delbetaling. Velg ønsket avbetalingsplan ved kassen.',
        },
        {
          q: 'Når blir kortet mitt belastet?',
          a: 'Kortet ditt blir belastet når vi sender ordren din, ikke når du legger inn ordren.',
        },
      ],
    },
    {
      category: 'Levering og frakt',
      questions: [
        {
          q: 'Hvor lang leveringstid har dere?',
          a: 'Vi leverer vanligvis innen 1-3 virkedager. Leveringstid kan variere avhengig av produktets lagerstatus.',
        },
        {
          q: 'Hvor mye koster frakt?',
          a: 'Frakt er gratis over 500,-. Under 500,- koster frakten 79,-.',
        },
        {
          q: 'Kan jeg spore min ordre?',
          a: 'Ja, du mottar en sporekode på e-post når ordren er sendt. Du kan følge sporingen på transportørens nettside.',
        },
      ],
    },
    {
      category: 'Retur og reklamasjon',
      questions: [
        {
          q: 'Hvor lenge har jeg returrett?',
          a: 'Du har 30 dagers åpent kjøp på alle produkter. Produktet må være ubrukt og i original emballasje.',
        },
        {
          q: 'Hvordan returnerer jeg et produkt?',
          a: 'Kontakt vår kundeservice på hei@elektrohype.no eller ring +47 22 33 44 55. Vi sender deg en returetikett.',
        },
        {
          q: 'Hvem betaler returfrakten?',
          a: 'Hvis produktet er feil eller defekt, betaler vi returfrakten. For vanlig retur betaler kunden returfrakten.',
        },
      ],
    },
    {
      category: 'Garanti og reklamasjon',
      questions: [
        {
          q: 'Har produktene garanti?',
          a: 'Ja, alle produktene har 2 års garanti i henhold til norsk forbrukerkjøpsloven.',
        },
        {
          q: 'Hva dekker garantien?',
          a: 'Garantien dekker feil og mangler som oppstår under normal bruk. Slitasje er ikke dekket.',
        },
        {
          q: 'Hvordan reklamerer jeg et produkt?',
          a: 'Kontakt oss på hei@elektrohype.no eller ring +47 22 33 44 55. Ta med deg produktet og kvitteringen.',
        },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <Link href="/kundeservice" className="hover:text-brand">Kundeservice</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Ofte stilte spørsmål</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <HelpCircle className="mx-auto mb-4 h-16 w-16 text-brand" />
          <h1 className="mb-4 text-4xl font-bold text-dark">Ofte stilte spørsmål</h1>
          <p className="text-lg text-gray-medium">
            Finn svar på de mest vanlige spørsmålene
          </p>
        </div>

        {/* FAQ sections */}
        <div className="space-y-8">
          {faqs.map((section, sectionIndex) => (
            <div key={sectionIndex} className="rounded-xl bg-white p-8 shadow-sm">
              <h2 className="mb-6 text-2xl font-bold text-dark">{section.category}</h2>
              <div className="space-y-4">
                {section.questions.map((faq, index) => (
                  <details
                    key={index}
                    className="group rounded-lg border border-gray-border p-4 transition-all hover:border-brand"
                  >
                    <summary className="flex cursor-pointer items-center justify-between font-semibold text-dark">
                      <span>{faq.q}</span>
                      <ChevronDown className="h-5 w-5 text-gray-medium transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-4 text-gray-medium">{faq.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Kontakt oss */}
        <div className="mt-12 rounded-xl bg-brand-light p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-dark">Fant du ikke svaret?</h2>
          <p className="mb-6 text-gray-medium">
            Kontakt oss gjerne, så hjelper vi deg videre!
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/kontakt"
              className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
            >
              Kontakt oss
            </Link>
            <a
              href="tel:+4722334455"
              className="rounded-lg border-2 border-brand px-6 py-3 font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
            >
              Ring oss
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

