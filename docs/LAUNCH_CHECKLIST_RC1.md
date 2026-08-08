# Launch Checklist RC1 — ElectroHypeX

**Status:** NO-GO (offentlig lansering)  
**Dato:** 2026-08-08  
**Release Manager:** verifisert mot lokal butikk (`localhost:3000`), katalog-DB og kode  
**Grunnmur:** Search RC1 · Merchandising RC1 · Buyer RC1 · Marketing RC1 · Store DNA RC1  

Dette er den **eneste** sjekklisten som avgjør om butikken kan lanseres.  
Ingen ny funksjonalitet — kun GO/NO-GO mot produksjonsklarhet.

**Tegnforklaring**

| Symbol | Betydning |
|--------|-----------|
| PASS | Verifisert OK i denne runden |
| FAIL | Feilet — se alvorlighet og tiltak |
| PARTIAL | Delvis OK / krever manuell bekreftelse før GO |
| BLOCKER | Må være PASS før offentlig GO |

---

## 1. Checkout

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| Legg produkt i handlekurv | PARTIAL | Kode: `ProductCard` / `PurchasePanel` + `CartProvider` med `preventDefault`. Automatisert klikk i nettleser ga tom kurv (mulig automation/hydratiserings-støy). **Krever 1 manuell smoke-test.** |
| Endre antall | PARTIAL | Implementert i `app/cart/page.tsx`. Ikke fullført E2E i denne runden. |
| Fjern produkt | PARTIAL | Implementert i kurv-UI. Ikke fullført E2E i denne runden. |
| Frakt beregnes riktig | PASS | Server-autoritativ: `lib/checkout/shipping.ts` — standard 99 kr, gratis ≥ 500 kr, ekspress 199 kr. Checkout API bruker `computeShippingCost`. |
| Stripe Checkout fungerer | **FAIL — BLOCKER** | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` er **MISSING** i lokal env (`.env` / `.env.local`). API returnerer 500 uten nøkkel (`app/api/checkout/route.ts`). |
| Ordre opprettes | PARTIAL | Flyt finnes (Checkout Session + Stripe webhook → `markOrderPaid`). Kan ikke bevises uten Stripe-nøkler. |
| Ordrebekreftelse fungerer | PARTIAL | Side: `/order-confirmation` + e-post via Resend i webhook. `RESEND_API_KEY` er satt. Full E2E krever Stripe. |

### Checkout — funn

1. **Stripe-nøkler mangler (BLOCKER)**  
   - Alvorlighet: Kritisk  
   - Løsning: Sett `sk_live_`/`pk_live_` (eller test for staging), webhook secret, verifiser endpoint i Stripe Dashboard. Kjør ett ekte testkjøp.

2. **Handlekurv E2E ikke lukket**  
   - Alvorlighet: Middels  
   - Løsning: Manuell test: legg i kurv → endre antall → fjern → gå til checkout.

---

## 2. Produkter

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| Ingen manglende bilder | PASS | 397 aktive: **0** uten bilde-URL (`tmp/launch-rc1-verify.json`). |
| Pris vises korrekt | PASS | UI viser NOK med `,-`; **0** produkter med `price ≤ 0`; **0** med `compareAtPrice < price`. |
| Variantvalg fungerer | PARTIAL | Variant-modell + UI i `PurchasePanel` finnes. Antall produkter med varianter: lavt i kuratert katalog. Spot-sjekk anbefales på 2–3 variant-SKU-er. |
| Lagerstatus vises | PASS | Kort viser «Tilgjengelig · 5–12 virkedager». Policy: dropship tillater kjøp ved soft stock (`lib/checkout/stock-policy.ts`). |
| Rabatt vises riktig | PASS | Rabattbadge (f.eks. −18 %) når `compareAtPrice > price` — observert på produktsøk. |

### Produkter — funn

Ingen kritiske katalogfeil i denne runden (Merch RC1).  
**Merknad:** Generiske titler («Gaming-mus» × mange) er bevisst kuratert — ikke launch-blocker, men Marketing bør bruke A/B-listen.

---

## 3. Søk (Search RC1)

Kjørt mot aktiv katalog + `rankProductsForSearch` (2026-08-08).

| Spørring | Resultat | Treff | Topp 3 |
|----------|----------|-------|--------|
| `mus` | **PASS** | 54 | Gaming-mus, Gaming-mus, Trådløs mus |
| `musmatte` | **FAIL** | 0 | — |
| `musematte` | **PASS** | 8 | RGB musematte ×3 |
| `tastatur` | **PASS** | 105 | Tastatur ×3 |
| `gaming tastatur` | **PASS** | 104 | Gaming-tastatur ×3 |
| `usb c` | **PASS** | 16 | USB-C Lader, … |
| `usb-c` | **PASS** | 16 | USB-C Lader, … |
| `webcam` | **PASS** | 6 | Webkamera ×3 |
| `mobilholder` | **PASS*** | 7 | *Kabelholder* først, deretter Magnetisk telefonholder / Telefonholder |
| `iphone deksel` | **PASS** | 1 | Personvern-deksel til telefon |

\*PASS på treff, men ranking er svak (tilbehør før telefonholder).

### Søk — funn

1. **`musmatte` → 0 treff**  
   - Alvorlighet: Middels (brukere skriver ofte «musmatte»; `musematte` virker)  
   - Løsning: Ett synonym/rewrite `musmatte → musematte`. Search RC1 er frosset — tillat kun som **dokumentert launch-bugfix**, ikke bred ranking-endring.  
   - Anbefaling: fikses før GO, eller aksepteres eksplisitt som kjent begrensning.

2. **`mobilholder` ranking**  
   - Alvorlighet: Lav  
   - Løsning: Launch RC2 / senere ranking (Search frosset).

---

## 4. Mobil

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| iPhone | PARTIAL | Responsive layout observert i smal viewport (meny, kort, hero-område). **Ikke testet på fysisk iPhone.** |
| Android | PARTIAL | Samme — krever fysisk enhet eller BrowserStack. |
| Hero | PASS | Hero lastes; kampanjebilde brukes. |
| Meny | PASS | «Åpne meny» + Tilbud synlig i smal viewport. |
| Produktside | PARTIAL | Kort/grid OK. Full PDP ikke dybdetestet på mobil i denne runden. |
| Checkout | PARTIAL | Avhenger av Stripe (blocker §1). |
| Søk | PASS | `/products?q=` fungerer mobil-layout. |
| Bilder | PASS | Produktbilder lastes på listing. |

### Mobil — funn

- Alvorlighet: Middels (prosess)  
- Løsning: 15 min manuell runde på ekte iPhone + Android før GO.

---

## 5. Performance

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| Lighthouse Desktop | PARTIAL | Ikke kjørt på nytt i RC1-sjekken. Tidligere perf-arbeid (cache, Image, hero) er i kodebasen. |
| Lighthouse Mobile | PARTIAL | Samme — **må kjøres før GO**. |
| CLS | PARTIAL | Ikke målt nå. |
| LCP | PARTIAL | Ikke målt nå. |
| INP | PARTIAL | Ikke målt nå. |

### Performance — funn

1. **Manglende ferske Lighthouse-tall**  
   - Alvorlighet: Middels (ikke funksjonsblocker, men GO-krav)  
   - Løsning: Kjør Lighthouse prod/staging (Desktop + Mobile) på `/` og én PDP. Mål: LCP < 2.5s, CLS < 0.1, INP < 200ms (grovt).

---

## 6. SEO

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| sitemap | PASS | `GET /sitemap.xml` → 200 (`app/sitemap.ts`) |
| robots | PASS | `GET /robots.txt` → 200; disallow `/admin/`, `/api/`, `/checkout/`, `/cart/`, `/orders/` |
| metadata | PASS | Root `metadata` + product SEO-felter; `metadataBase` satt |
| canonical | PASS | Root + juridiske sider har `alternates.canonical` |
| Open Graph | PASS | OG i `app/layout.tsx`; `public/og-image.jpg` finnes |
| favicon | PASS | `GET /favicon.ico` → 200 (ingen dedikert `app/icon.*` — fungerer via default/public) |

### SEO — funn

Ingen blocker. Valgfritt: legg eksplisitt `app/icon.tsx` / apple-touch for mer forutsigbar branding (Launch RC2).

---

## 7. Sikkerhet

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| Admin beskyttet | PASS | `middleware.ts` redirecter `/admin` → login (307 observert). Rolle sjekkes i panel/API. |
| Environment variables | **FAIL — BLOCKER** | Stripe + analytics nøkler mangler lokalt. Prod må ha komplette secrets uten å committe dem. |
| Stripe secrets | **FAIL — BLOCKER** | Se §1. |
| Ingen console errors | PARTIAL | DevTools Next.js overlay synlig i dev (forventet). Prod-smoke mangler. |

### Sikkerhet — funn

1. **Secrets ikke konfigurert for betaling** — kritisk (samme som §1).  
2. Bekreft at prod aldri logger Stripe-nøkler; webhook verifiserer signatur.

---

## 8. Juridisk

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| Personvern | PASS | `/personvern` → 200, innhold om GDPR/cookies |
| Cookies | PASS | `/cookies` → 200 + `CookieConsentBanner` + consent-gate for analytics |
| Retur | PASS | `/retur` → 200 |
| Angrerett | PASS | Beskrevet på retursiden (14 dagers angrerett + åpent kjøp) |
| Kontaktinfo | PASS | Footer: `support@electrohypex.com`, `+47 41299063`, `/kontakt` → 200 |

### Juridisk — funn

1. **`ORG_NUMBER` / `COMPANY_ADDRESS` tomme i env**  
   - Alvorlighet: Middels–høy (tillit / forbrukerinfo)  
   - Løsning: Fyll org.nr. og adresse i env og sørg for at de vises i footer/vilkår der forventet.

---

## 9. Analytics

| Sjekk | Resultat | Evidens |
|-------|----------|---------|
| GA4 | **FAIL** | `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `GA4_*` MISSING |
| Meta Pixel | **FAIL** | `NEXT_PUBLIC_META_PIXEL_ID` / CAPI MISSING |
| Eventer (kode) | PASS | `trackEcommerce` for view_item, add_to_cart, begin_checkout, purchase (+ server purchase) |
| Purchase | PARTIAL | Server-side hook etter Stripe paid — krever nøkler |
| AddToCart | PARTIAL | Klientkode finnes — krever pixel + consent |
| BeginCheckout | PARTIAL | Trigges fra kurv — krever pixel + consent |

### Analytics — funn

1. **Ingen GA4/Meta/GTM ID i env**  
   - Alvorlighet: Høy for lanseringslæring (ikke hard checkout-blocker)  
   - Løsning: Sett GTM **eller** direkte GA4+Meta; test med Tag Assistant etter cookie-consent = all. Unngå dobbel-telling.

---

## GO / NO GO

### Verdict: **NO-GO** for offentlig lansering

Butikken har **sterk katalog- og søkegrunnmur** (Merch RC1 + Search RC1), juridiske sider, SEO-grunnlag og checkout-*arkitektur*. Den er **ikke** produksjonsklar før betaling og måling er bevist.

### Blockers (må PASS)

| # | Problem | Alvorlighet | Anbefalt løsning |
|---|---------|-------------|------------------|
| 1 | Stripe-nøkler + webhook mangler / ikke verifisert | Kritisk | Konfigurer secrets, ett testkjøp, ordre + e-postbekreftelse |
| 2 | Full checkout E2E (kurv → Stripe → ordrebekreftelse) ikke lukket | Kritisk | Manuell testplan 20 min |
| 3 | Analytics (GA4/Meta eller GTM) ikke konfigurert | Høy | Sett ID-er, verifiser purchase/add_to_cart/begin_checkout |

### Sterke sider (klart nok)

- Katalog uten manglende bilder / prisfeil (Merch RC1)
- 9/10 søk PASS (Search RC1)
- robots / sitemap / OG / personvern / cookies / retur / kontakt
- Admin gated
- Fraktlogikk server-side

### Før GO — kort sjekkliste for eier

1. [ ] Stripe live/test nøkler + webhook  
2. [ ] Ett fullført testkjøp med ordrebekreftelse-e-post  
3. [ ] GA4/Meta eller GTM live etter cookie-consent  
4. [ ] Org.nr. + adresse synlig  
5. [ ] Manuell mobil (iPhone + Android)  
6. [ ] Lighthouse Desktop + Mobile notert  
7. [ ] Beslutning om `musmatte`-fix (ja/nei)

### Launch RC2 (kun dokumentert — ikke implementert her)

- Synonym `musmatte` → `musematte`  
- Bedre ranking for `mobilholder`  
- Dedikert `app/icon` / apple-touch  
- Differensierte produktitler for A-liste  
- Fylle Hjem & Fritid-kategorien  

---

*Sist oppdatert: 2026-08-08 · Evidens: `tmp/launch-rc1-verify.json`, HTTP-sjekker, kodegjennomgang, nettleser-smoke.*
