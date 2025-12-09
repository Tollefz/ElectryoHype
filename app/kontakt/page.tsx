import Link from 'next/link';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';

export default function KontaktPage() {
  return (
    <main className="min-h-screen bg-gray-light py-12">
      <div className="mx-auto max-w-4xl px-4">
        {/* Breadcrumbs */}
        <nav className="mb-8 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <Link href="/kundeservice" className="hover:text-brand">Kundeservice</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Kontakt oss</span>
        </nav>

        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-dark">Kontakt oss</h1>
          <p className="text-lg text-gray-medium">
            Har du spørsmål eller trenger hjelp? Ta kontakt med oss!
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Kontaktinformasjon */}
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-2xl font-bold text-dark">Kontaktinformasjon</h2>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Phone className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
                  <div>
                    <h3 className="mb-1 font-semibold text-dark">Telefon</h3>
                    <a href="tel:+4722334455" className="text-brand hover:underline">
                      +47 22 33 44 55
                    </a>
                    <p className="mt-1 text-sm text-gray-medium">Man-Fre: 09:00 - 18:00</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Mail className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
                  <div>
                    <h3 className="mb-1 font-semibold text-dark">E-post</h3>
                    <a href="mailto:hei@elektrohype.no" className="text-brand hover:underline">
                      hei@elektrohype.no
                    </a>
                    <p className="mt-1 text-sm text-gray-medium">Svar innen 24 timer</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <MapPin className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
                  <div>
                    <h3 className="mb-1 font-semibold text-dark">Adresse</h3>
                    <p className="text-gray-medium">
                      Teknologiveien 1<br />
                      0150 Oslo<br />
                      Norge
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Clock className="mt-1 h-6 w-6 flex-shrink-0 text-brand" />
                  <div>
                    <h3 className="mb-1 font-semibold text-dark">Åpningstider</h3>
                    <p className="text-gray-medium">
                      Mandag - Fredag: 09:00 - 18:00<br />
                      Lørdag: 10:00 - 16:00<br />
                      Søndag: Stengt
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Kontaktskjema */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-2xl font-bold text-dark">Send oss en melding</h2>

            <form className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-dark">Navn</label>
                <input
                  type="text"
                  required
                  className="w-full rounded-lg border border-gray-border px-4 py-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-dark">E-post</label>
                <input
                  type="email"
                  required
                  className="w-full rounded-lg border border-gray-border px-4 py-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-dark">Telefon (valgfritt)</label>
                <input
                  type="tel"
                  className="w-full rounded-lg border border-gray-border px-4 py-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-dark">Emne</label>
                <select className="w-full rounded-lg border border-gray-border px-4 py-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand">
                  <option>Generelt spørsmål</option>
                  <option>Ordre og levering</option>
                  <option>Retur og reklamasjon</option>
                  <option>Teknisk support</option>
                  <option>Andre henvendelser</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-dark">Melding</label>
                <textarea
                  rows={6}
                  required
                  className="w-full rounded-lg border border-gray-border px-4 py-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
              >
                Send melding
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

