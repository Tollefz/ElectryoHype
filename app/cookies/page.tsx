import Link from "next/link";
import { Cookie } from "lucide-react";

type Row = {
  name: string;
  who: string;
  purpose: string;
  required: "Yes" | "No";
  consent: "Yes" | "No";
  retention: string;
};

const COOKIES: Row[] = [
  {
    name: "next-auth.session-token\n(__Secure- next-auth.session-token on HTTPS)",
    who: "NextAuth.js (admin login)",
    purpose: "Authenticated admin session (JWT)",
    required: "Yes",
    consent: "No",
    retention: "Default ~30 days (JWT session maxAge)",
  },
  {
    name: "next-auth.csrf-token",
    who: "NextAuth.js",
    purpose: "CSRF protection for sign-in",
    required: "Yes",
    consent: "No",
    retention: "Session / auth flow",
  },
  {
    name: "next-auth.callback-url",
    who: "NextAuth.js",
    purpose: "Redirect target after login",
    required: "Yes",
    consent: "No",
    retention: "Short-lived during login",
  },
  {
    name: "ehx_consent",
    who: "CookieConsentBanner",
    purpose: "Stores cookie consent choice (necessary / all)",
    required: "Yes",
    consent: "No",
    retention: "365 days",
  },
  {
    name: "affiliateCode",
    who: "RefTracker (only after “Godta alle”)",
    purpose: "Affiliate referral attribution at checkout",
    required: "No",
    consent: "Yes",
    retention: "30 days",
  },
  {
    name: "_ga, _ga_*, _gid (Google)",
    who: "Google Analytics / GTM (only if IDs set + “Godta alle”)",
    purpose: "Traffic / usage analytics + ecommerce events",
    required: "No",
    consent: "Yes",
    retention: "Per Google defaults (e.g. _ga up to ~2 years, _gid ~24h)",
  },
  {
    name: "_fbp, _fbc (Meta)",
    who: "Meta Pixel (only if pixel ID set + “Godta alle”)",
    purpose: "Ads attribution and conversion measurement",
    required: "No",
    consent: "Yes",
    retention: "Up to ~90 days (_fbp)",
  },
  {
    name: "_ttp, _tt_enable_cookie (TikTok)",
    who: "TikTok Pixel (only if pixel ID set + “Godta alle”)",
    purpose: "Ads attribution and conversion measurement",
    required: "No",
    consent: "Yes",
    retention: "Per TikTok defaults",
  },
  {
    name: "_clck, _clsk (Microsoft Clarity)",
    who: "Clarity (only if project ID set + “Godta alle”)",
    purpose: "Session replay / UX analytics",
    required: "No",
    consent: "Yes",
    retention: "Per Microsoft Clarity defaults",
  },
];

const STORAGE: { name: string; purpose: string; note: string }[] = [
  {
    name: "dropshipping-cart (localStorage)",
    purpose: "Shopping cart contents",
    note: "Not a cookie; first-party storage for cart. No network beacon.",
  },
  {
    name: "ehx_cookie_consent_v1 (localStorage)",
    purpose: "Mirrors consent choice for the banner/GA gate",
    note: "Not a cookie; used client-side only.",
  },
  {
    name: "ehx_pending_affiliate (localStorage)",
    purpose: "Holds ?ref= until marketing consent is given",
    note: "Prevents setting affiliateCode without consent.",
  },
  {
    name: "theme (localStorage, next-themes)",
    purpose: "UI theme preference",
    note: "Not a cookie in current setup.",
  },
];

export default function CookiesPage() {
  return (
    <div className="bg-white">
      <div className="border-b bg-gray-50 py-10">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <Cookie className="mx-auto mb-3 h-12 w-12 text-brand" />
          <h1 className="text-3xl font-bold text-dark sm:text-4xl">Cookies</h1>
          <p className="mt-2 text-gray-600">
            Oversikt over informasjonskapsler ElectroHypeX setter (førstepart og eventuelle
            analyseverktøy).
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <section className="space-y-3 text-sm text-gray-700">
          <h2 className="text-xl font-bold text-dark">Trenger du å samtykke?</h2>
          <p>
            <strong>Nødvendige cookies</strong> (admin-innlogging / sikkerhet / lagring av
            samtykkevalg) krever ikke samtykke under ePrivacy.{" "}
            <strong>Ikke-nødvendige cookies</strong> (affiliate-sporing og Google Analytics) krever
            samtykke før de settes. Handlekurven lagres i localStorage, ikke som cookie.
          </p>
          <p>
            Du kan endre valg ved å slette nettsteddata for electrohypex.com og laste siden på nytt,
            eller kontakte oss via{" "}
            <Link href="/kundeservice" className="text-green-700 underline">
              kundeservice
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-dark">Cookies vi setter</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="p-3">Cookie</th>
                  <th className="p-3">Settes av</th>
                  <th className="p-3">Formål</th>
                  <th className="p-3">Nødvendig</th>
                  <th className="p-3">Krever samtykke</th>
                  <th className="p-3">Lagringstid</th>
                </tr>
              </thead>
              <tbody>
                {COOKIES.map((c) => (
                  <tr key={c.name} className="border-t align-top">
                    <td className="whitespace-pre-wrap p-3 font-mono text-xs">{c.name}</td>
                    <td className="p-3">{c.who}</td>
                    <td className="p-3">{c.purpose}</td>
                    <td className="p-3">{c.required}</td>
                    <td className="p-3">{c.consent}</td>
                    <td className="p-3">{c.retention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-dark">Annen lagring (ikke cookies)</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {STORAGE.map((s) => (
              <li key={s.name} className="rounded-lg border p-3">
                <p className="font-mono text-xs font-semibold text-dark">{s.name}</p>
                <p>{s.purpose}</p>
                <p className="text-gray-500">{s.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Tredjepart under betaling</p>
          <p className="mt-1">
            Stripe kan sette egne cookies i betalingsvinduet / Elements. Det skjer under Stripes
            ansvar når du starter betaling. Se Stripes cookie-policy for detaljer.
          </p>
        </section>
      </div>
    </div>
  );
}
