import Link from "next/link";
import { Cookie } from "lucide-react";
import type { Metadata } from "next";
import { SITE_CONFIG } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Informasjonskapsler | ElectroHypeX" },
  description:
    "Oversikt over informasjonskapsler ElectroHypeX setter — nødvendige og valgfrie cookies.",
  alternates: { canonical: `${SITE_CONFIG.siteUrl}/cookies` },
};

type Row = {
  name: string;
  who: string;
  purpose: string;
  required: "Ja" | "Nei";
  consent: "Ja" | "Nei";
  retention: string;
};

const COOKIES: Row[] = [
  {
    name: "next-auth.session-token\n(__Secure- next-auth.session-token på HTTPS)",
    who: "NextAuth.js (admin-innlogging)",
    purpose: "Autentisert admin-økt (JWT)",
    required: "Ja",
    consent: "Nei",
    retention: "Ca. 30 dager",
  },
  {
    name: "next-auth.csrf-token",
    who: "NextAuth.js",
    purpose: "CSRF-beskyttelse ved innlogging",
    required: "Ja",
    consent: "Nei",
    retention: "Økt / innloggingsflyt",
  },
  {
    name: "next-auth.callback-url",
    who: "NextAuth.js",
    purpose: "Redirect etter innlogging",
    required: "Ja",
    consent: "Nei",
    retention: "Kortvarig under innlogging",
  },
  {
    name: "ehx_consent",
    who: "Samtykkebanner",
    purpose: "Lagrer samtykkevalg (nødvendig / alle)",
    required: "Ja",
    consent: "Nei",
    retention: "365 dager",
  },
  {
    name: "affiliateCode",
    who: "RefTracker (kun etter «Godta alle»)",
    purpose: "Affiliate-attribusjon i kassen",
    required: "Nei",
    consent: "Ja",
    retention: "30 dager",
  },
  {
    name: "_ga, _ga_*, _gid (Google)",
    who: "Google Analytics / GTM (kun hvis ID er satt + «Godta alle»)",
    purpose: "Trafikk- / bruksanalyse + e-handelshendelser",
    required: "Nei",
    consent: "Ja",
    retention: "Etter Google (f.eks. _ga opptil ~2 år)",
  },
  {
    name: "_fbp, _fbc (Meta)",
    who: "Meta Pixel (kun hvis pixel-ID er satt + «Godta alle»)",
    purpose: "Annonseattribusjon og konverteringsmåling",
    required: "Nei",
    consent: "Ja",
    retention: "Opptil ~90 dager (_fbp)",
  },
  {
    name: "_ttp, _tt_enable_cookie (TikTok)",
    who: "TikTok Pixel (kun hvis pixel-ID er satt + «Godta alle»)",
    purpose: "Annonseattribusjon og konverteringsmåling",
    required: "Nei",
    consent: "Ja",
    retention: "Etter TikToks standard",
  },
  {
    name: "_clck, _clsk (Microsoft Clarity)",
    who: "Clarity (kun hvis prosjekt-ID er satt + «Godta alle»)",
    purpose: "Øktopptak / UX-analyse",
    required: "Nei",
    consent: "Ja",
    retention: "Etter Microsoft Clarity",
  },
];

const STORAGE: { name: string; purpose: string; note: string }[] = [
  {
    name: "dropshipping-cart (localStorage)",
    purpose: "Handlekurvinnhold",
    note: "Ikke en cookie; førsteparts lagring for kurv.",
  },
  {
    name: "ehx_cookie_consent_v1 (localStorage)",
    purpose: "Speiler samtykkevalg for banner/analyse",
    note: "Ikke en cookie; kun klient-side.",
  },
  {
    name: "ehx_pending_affiliate (localStorage)",
    purpose: "Holder ?ref= til markedsføringssamtykke er gitt",
    note: "Hindrer affiliate-cookie uten samtykke.",
  },
  {
    name: "theme (localStorage, next-themes)",
    purpose: "UI-temapreferanse",
    note: "Ikke en cookie i nåværende oppsett.",
  },
];

export default function CookiesPage() {
  return (
    <div className="bg-white">
      <div className="border-b bg-gray-50 py-10">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <Cookie className="mx-auto mb-3 h-12 w-12 text-brand" />
          <h1 className="text-3xl font-bold text-dark sm:text-4xl">
            Informasjonskapsler
          </h1>
          <p className="mt-2 text-gray-600">
            Oversikt over informasjonskapsler ElectroHypeX setter (førstepart og
            eventuelle analyseverktøy).
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <section className="space-y-3 text-sm text-gray-700">
          <h2 className="text-xl font-bold text-dark">Trenger du å samtykke?</h2>
          <p>
            <strong>Nødvendige cookies</strong> (admin-innlogging / sikkerhet /
            lagring av samtykkevalg) krever ikke samtykke under ePrivacy.{" "}
            <strong>Ikke-nødvendige cookies</strong> (affiliate-sporing og Google
            Analytics) krever samtykke før de settes. Handlekurven lagres i
            localStorage, ikke som cookie.
          </p>
          <p>
            Du kan endre valg ved å slette nettsteddata for electrohypex.com og
            laste siden på nytt, eller kontakte oss via{" "}
            <Link href="/kundeservice" className="text-green-700 underline">
              kundeservice
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-dark">
            Cookies vi setter
          </h2>
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
                    <td className="whitespace-pre-line p-3 font-mono text-xs">
                      {c.name}
                    </td>
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
          <h2 className="mb-3 text-xl font-bold text-dark">
            Annen lokal lagring
          </h2>
          <ul className="space-y-3 text-sm text-gray-700">
            {STORAGE.map((s) => (
              <li key={s.name} className="rounded-lg border p-3">
                <p className="font-mono text-xs text-gray-500">{s.name}</p>
                <p className="mt-1 font-medium text-dark">{s.purpose}</p>
                <p className="mt-0.5 text-gray-600">{s.note}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
