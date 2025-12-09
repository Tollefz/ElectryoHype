<div align="center">

# 🚀 Dropshipping Upgrade

Fullverdig dropshipping-plattform bygget på Next.js 14 App Router med Prisma, NextAuth, Tailwind CSS, shadcn/ui og moderne betalings- og automasjonsflyt. Systemet lar deg importere produkter fra Alibaba/eBay/Temu, selge dem på egen nettbutikk, og automatisk sende ordredata til leverandørene når kunder handler.

</div>

---

## 🧱 Teknisk Stack

| Lag            | Teknologi |
|----------------|-----------|
| Frontend       | Next.js 14 (App Router), React 18, Tailwind CSS, Framer Motion, shadcn/ui |
| Backend        | Next.js server actions + API routes, Prisma ORM |
| Database       | PostgreSQL (lokalt kan SQLite brukes for utvikling) |
| Autentisering  | NextAuth (Credentials Provider) |
| Betalinger     | Stripe, Vipps, Klarna, PayPal |
| Job Queue      | (Planlagt) Background workers via server actions / cron |
| Email          | Resend eller Nodemailer + React Email |

---

## 📁 Prosjektstruktur

```
app/                # Offentlig storefront + admin app router
components/         # Delte UI-komponenter (React + shadcn/ui)
lib/                # Prisma client, auth, helper utilities, suppliers, email
types/              # Delte TypeScript typer og NextAuth deklarasjoner
prisma/             # schema.prisma + migrasjoner
api/                # Eksterne integrasjonsklienter (Vipps/Klarna/Stripe osv.)
emails/             # React Email maler
scripts/            # CLI scripts (seed, deploy helpers)
```

---

## ⚙️ Kom i gang

### 1. Klargjør miljøvariabler

```bash
cp .env.example .env
# Fyll inn faktiske nøkler før du kjører dev-server
```

### 2. Installer avhengigheter

```bash
npm install
```

### 3. Generer Prisma client og migrer database

```bash
npx prisma generate
npx prisma db push        # eller npx prisma migrate dev --name init
```

### 4. Seed admin-bruker (frivillig)

```bash
npm run seed
```

### 5. Start utviklingsserver

```bash
npm run dev
```

Åpne `http://localhost:3000`. Admin-innlogging ligger på `/admin/login`.

---

## 🔐 Autentisering (NextAuth)

- Bruker Credentials Provider med e-post + passord (bcrypt hash lagres i `User`-tabellen).
- `ADMIN_EMAIL` + `ADMIN_PASSWORD` brukes ved første seed for å opprette superadmin.
- `middleware.ts` låser ned alle `/admin/*`-ruter og redirecter til `/admin/login` hvis ikke innlogget.
- Rollebasert layout i `app/admin/layout.tsx`.

---

## 💳 Betalingsintegrasjoner

| Gateway | Oppsett |
|---------|---------|
| Stripe  | Sett `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`. API routes: `/api/create-payment-intent`, `/api/webhooks/stripe`. Bruker Stripe Elements og Payment Intents med 3DS. |
| Klarna  | Sett `KLARNA_API_KEY`. API route `/api/create-klarna-session` oppretter session og returnerer HTML snippet som rendres i checkout. |
| PayPal  | Sett `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`. Frontend bruker PayPal JS SDK; backend route `/api/paypal/capture` fanger betalingene. |
| Vipps   | Sett `VIPPS_CLIENT_ID`, `VIPPS_CLIENT_SECRET`, `VIPPS_SUBSCRIPTION_KEY`, `VIPPS_MERCHANT_SERIAL_NUMBER`. `/api/vipps/initiate` oppretter betaling; `/api/vipps/callback` håndterer retur. |

Alle betalingssuksesser oppdaterer Prisma-ordrer og trigger ordre-automasjon mot leverandører.

---

## 📦 Leverandør-automatisering

`/lib/suppliers` eksponerer et felles interface:

```ts
export interface SupplierAdapter {
  placeOrder(input: SupplierOrderInput): Promise<SupplierOrderResult>;
  checkOrderStatus(supplierOrderId: string): Promise<SupplierStatusResult>;
  getTrackingInfo(supplierOrderId: string): Promise<SupplierTrackingResult>;
}
```

- `alibaba.ts`: genererer detaljert bestillings-epost hvis API mangler, og logger ordre slik at admin kan følge opp manuelt.
- `ebay.ts`: bruker eBay API (med fallback til e-post).
- `temu.ts`: e-postbasert bestilling.
- `orderProcessor` (job worker) plukker ordrer med status `paid`, oppretter leverandørordre, lagrer `supplierOrderId` og status, sender e-poster og logger alt i database.

---

## 📬 Epost-system

Ligger i `emails/` og `lib/email.ts`.

Maler:
- `order-confirmation.tsx`
- `order-shipped.tsx`
- `admin-new-order.tsx`

Triggers:
1. Kunde bestiller → ordrebekreftelse + admin varsel.
2. Leverandørordre registreres → admin får detaljer.
3. Trackingnummer legges til → send shipping-notis til kunde.

Settes opp via Resend (anbefalt) eller Nodemailer SMTP.

---

## 🧾 Prisma-modeller

Se `prisma/schema.prisma` for fullstendig definisjon. Inkluderer:
- `User`
- `Customer`
- `Product`
- `Order` + `OrderItem`
- `Setting`

Med relasjoner mellom kunde → ordre, ordre → orderItems → produkter, og key/value settings.

---

## 🧪 Testing

| Type        | Verktøy      | Beskrivelse |
|-------------|--------------|-------------|
| Unit        | Vitest       | Tester produktimport, validering, helpers. |
| Integration | Playwright   | Checkout flyt, admin login, ordreoppdatering. |
| Emails      | React Email  | Snapshot-testing av maler. |

Se `vitest.config.ts`, `playwright.config.ts` og mapper i `tests/`.

---

## 🚀 Deploy-guide

1. **Database**
   - Supabase eller Railway PostgreSQL.
   - Kjør `npx prisma migrate deploy`.
2. **Vercel**
   - Push til GitHub, koble repo i Vercel, sett alle miljøvariabler fra `.env`.
3. **Post-deploy sjekkliste**
   - Verifiser Stripe/Klarna/PayPal/Vipps i testmodus.
   - Send testordre, sjekk epost og leverandør-logs.
4. **Produksjon**
   - Bytt til prod API-nøkler, sett opp domene + SSL, aktiver backup og monitorering (Vercel Analytics, Sentry).

Detaljert sjekkliste kommer i `DEPLOYMENT.md`.

---

## 🔐 Sikkerhet & ytelse

- Rate limiting på API-ruter (Next middleware + `lib/rate-limit.ts`).
- CSRF token på sensitive POST-endepunkter.
- Zod-validering på både klient og server.
- Secure headers i `next.config.mjs`.
- Prisma beskytter mot SQL injection.
- Bruker Next/Image, ISR, caching og lazy loading for best mulig Core Web Vitals.

---

## 🧭 Videre arbeid

- Fullføre automatiske cron-jobs for lageroppdatering.
- Live sporing av leverandørstatus med websockets.
- Mer avansert AI-styrt prisoptimalisering (planlagt).

Bli gjerne med og bidra!
