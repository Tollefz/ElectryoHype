# ElectroHypeX - E-commerce Platform

En moderne, fullverdig e-commerce plattform bygget med Next.js 16, Prisma, Neon PostgreSQL, og Stripe. Plattformen støtter dropshipping, multi-store funksjonalitet, og komplett admin-dashboard.

## 🚀 Teknologistack

- **Frontend:** Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Server Components
- **Database:** Neon PostgreSQL (serverless)
- **ORM:** Prisma
- **Authentication:** NextAuth.js
- **Payment:** Stripe Checkout
- **Image Upload:** UploadThing (konfigurert, kan byttes til Cloudinary)
- **Deployment:** Vercel
- **Email:** Resend (via React Email)
- **Automation:** Inngest

## ✨ Funksjoner

### Kunde-funksjoner
- ✅ Produktkatalog med filtrering og søk
- ✅ Handlekurv med localStorage-persistens
- ✅ Stripe Checkout Session (full integrasjon)
- ✅ Ordrebekreftelse med e-post
- ✅ Produktdetaljer med varianter
- ✅ Kategorifiltrering
- ✅ Tilbudsseksjon
- ✅ Responsiv design

### Admin-funksjoner
- ✅ Full CRUD for produkter
- ✅ Bildeopplasting (fil eller URL)
- ✅ Produktvarianter
- ✅ Ordrehåndtering med statusoppdatering
- ✅ Dashboard med statistikk
- ✅ Kundeoversikt
- ✅ Dropshipping-integrasjon
- ✅ Automatisk ordrebehandling

### Tekniske funksjoner
- ✅ ISR (Incremental Static Regeneration) - 60s revalidate
- ✅ SEO-optimalisert med OpenGraph og Twitter Cards
- ✅ Error boundaries og robust feilhåndtering
- ✅ Server-side autentisering
- ✅ Multi-store support
- ✅ Webhook-basert ordrehåndtering

## 📦 Installering

### Forutsetninger
- Node.js 18+ 
- npm eller yarn
- Neon PostgreSQL database
- Stripe-konto (for betalinger)

### Lokal utvikling

**📖 Se [Local Setup Guide](./docs/local-setup.md) for detaljert instruksjoner.**

**Quick start:**

1. **Klon repositoriet**
```bash
git clone <repo-url>
cd ElectryoHype
```

2. **Installer avhengigheter**
```bash
npm install
```

3. **Kjør setup** (automatisk oppsett)
```bash
npm run setup
```

Dette vil:
- Opprette `.env` fil fra `.env.example` (hvis mangler)
- Kjøre `prisma generate`
- Kjøre `prisma migrate dev` (kun for lokale databaser)
- Gi tydelige instruksjoner hvis noe mangler

**Alternativt, manuell oppsett:**

3. **Opprett `.env` fil** med minimum variabler:

```env
# ⚠️ PÅKREVD
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
DEFAULT_STORE_ID="default-store"
NEXTAUTH_SECRET="din-super-hemmelige-nøkkel-her-minst-32-tegn"
NEXTAUTH_URL="http://localhost:3000"
```

**💡 Hvordan få DATABASE_URL:**
- Opprett gratis konto på [Neon](https://neon.tech)
- Gå til Dashboard → Connection Details
- Kopier connection string til `.env`

4. **Sett opp databasen**

```bash
# Generer Prisma Client
npx prisma generate

# Kjør migrasjoner
npx prisma migrate dev

# Seed database (valgfritt)
npm run seed
```

5. **Start utviklingsserver**

```bash
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000) i nettleseren.

**🔧 Feilsøking:** Se [Local Setup Guide](./docs/local-setup.md#feilsøking) for vanlige feil og løsninger.

## 🚢 Produksjonsdeploy

### Vercel Deployment

1. **Push kode til GitHub/GitLab**

2. **Importer prosjekt i Vercel**
   - Gå til [Vercel Dashboard](https://vercel.com)
   - Klikk "New Project"
   - Importer repositoriet

3. **Konfigurer miljøvariabler i Vercel**
   - Gå til Project → Settings → Environment Variables
   - Legg til alle variabler fra `.env` (se over)
   - **VIKTIG:** For `DATABASE_URL`, bruk Neon **POOLER** connection string:
     ```
     postgresql://user:password@ep-xxx-pooler.us-east-1.aws.neon.tech/db?sslmode=require
     ```

4. **Konfigurer Build Command**
   - Gå til Project → Settings → Build & Development
   - Sett Build Command til: `npm run vercel-build`
   - (Dette er allerede satt i `package.json`)

5. **Deploy**
   - Klikk "Deploy"
   - Vercel vil automatisk bygge og deploye

### Stripe Webhook Setup

1. **Opprett webhook i Stripe Dashboard**
   - Gå til Stripe Dashboard → Developers → Webhooks
   - Klikk "Add endpoint"
   - URL: `https://din-domene.vercel.app/api/webhooks/stripe`
   - Velg events:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

2. **Kopier webhook secret**
   - Etter opprettelse, kopier "Signing secret"
   - Legg til i Vercel Environment Variables som `STRIPE_WEBHOOK_SECRET`

## 📁 Prosjektstruktur

```
dropshipping-upgrade/
├── app/                    # Next.js App Router
│   ├── admin/             # Admin routes (beskyttet)
│   ├── api/               # API routes
│   │   ├── admin/         # Admin API
│   │   ├── checkout/      # Stripe checkout
│   │   ├── uploadthing/   # Image upload
│   │   └── webhooks/      # Stripe webhooks
│   ├── products/          # Produktsider
│   ├── cart/              # Handlekurv
│   ├── checkout/          # Checkout flow
│   └── order-confirmation/ # Ordrebekreftelse
├── components/            # React komponenter
├── lib/                   # Utilities
│   ├── prisma.ts         # Prisma client singleton
│   ├── auth.ts           # NextAuth konfigurasjon
│   ├── cart-context.tsx  # Handlekurv state
│   └── utils/            # Hjelpefunksjoner
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Database migrasjoner
└── public/               # Statiske filer
```

## 🔐 Sikkerhet

- **Admin-routes:** Beskyttet via server-side auth guard i `app/admin/layout.tsx`
- **API-routes:** Validerer autentisering via `getAuthSession()`
- **Database:** Bruker Prisma med prepared statements (SQL injection-safe)
- **Environment variables:** Aldri commit `.env` filer
- **Stripe:** Webhook-signatur valideres for alle webhook-requests

## 🛠️ API-dokumentasjon

### Produkter

#### `GET /api/admin/products`
Hent alle produkter (admin only)

**Query params:**
- `page` - Sidenummer (default: 1)
- `limit` - Antall per side (default: 50, max: 100)
- `search` - Søk i produktnavn
- `category` - Filtrer på kategori

**Response:**
```json
{
  "ok": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

#### `POST /api/admin/products`
Opprett nytt produkt (admin only)

**Body:**
```json
{
  "name": "Produktnavn",
  "price": 999.00,
  "category": "Data & IT",
  "images": "[\"https://...\"]",
  "storeId": "default-store",
  "isActive": true
}
```

#### `PATCH /api/admin/products/[id]`
Oppdater produkt (admin only)

#### `DELETE /api/admin/products/[id]`
Slett produkt (admin only)

### Checkout

#### `POST /api/checkout`
Opprett Stripe Checkout Session

**Body:**
```json
{
  "items": [
    {
      "productId": "...",
      "name": "Produktnavn",
      "price": 999.00,
      "quantity": 1,
      "image": "https://..."
    }
  ],
  "customerEmail": "kunde@example.com",
  "shippingAddress": {...}
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/...",
  "sessionId": "cs_...",
  "orderId": "...",
  "orderNumber": "ORD-..."
}
```

### Ordrer

#### `GET /api/admin/orders/[id]`
Hent ordredetaljer (admin only)

#### `PATCH /api/admin/orders/[id]`
Oppdater ordrestatus (admin only)

**Body:**
```json
{
  "status": "shipped",
  "paymentStatus": "paid",
  "trackingNumber": "ABC123",
  "trackingUrl": "https://..."
}
```

### Bildeopplasting

#### `POST /api/upload/image`
Last opp bilde (admin only)

**Body:** `multipart/form-data` med `file` field

**Response:**
```json
{
  "ok": true,
  "url": "data:image/...;base64,...",
  "filename": "image.jpg",
  "size": 12345
}
```

**Note:** For produksjon, bytt til UploadThing eller Cloudinary for bedre ytelse.

## 🖼️ Bildeopplasting

Plattformen støtter to metoder for bildeopplasting:

### 1. Filopplasting (via API)
- Bruk `/api/upload/image` endpoint
- Støtter base64-encoding (midlertidig løsning)
- **Anbefalt for produksjon:** Implementer UploadThing eller Cloudinary

### 2. URL-opplasting
- Lim inn bildelenke direkte i produktformularen
- Støtter eksterne CDN-er (Alibaba, eBay, Temu)

### UploadThing Setup (Anbefalt)

1. **Opprett konto på [UploadThing](https://uploadthing.com)**
2. **Installer pakker:**
```bash
npm install uploadthing @uploadthing/react
```
3. **Sett miljøvariabler:**
```env
UPLOADTHING_SECRET="sk_live_..."
UPLOADTHING_APP_ID="..."
```
4. **Konfigurer i `app/api/uploadthing/core.ts`**

## 💳 Stripe Integrasjon

### Test-kort
- **Kortnummer:** 4242 4242 4242 4242
- **CVV:** 123
- **Utløpsdato:** Hvilken som helst fremtidig dato

### Webhook Events
Plattformen håndterer følgende Stripe events:
- `checkout.session.completed` - Oppdaterer ordre til "paid"
- `payment_intent.succeeded` - Alternativ betalingsmetode
- `payment_intent.payment_failed` - Marker ordre som feilet

### Miljøvariabler
```env
STRIPE_SECRET_KEY="sk_test_..." # eller sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..." # eller pk_live_...
STRIPE_WEBHOOK_SECRET="whsec_..."
```

## 📊 Ordresystem

### Ordrestatus
- `pending` - Venter på betaling
- `paid` - Betalt (automatisk via webhook)
- `processing` - Behandles
- `shipped` - Sendt
- `delivered` - Levert
- `cancelled` - Kansellert

### Betalingsstatus
- `pending` - Venter
- `paid` - Betalt
- `failed` - Feilet
- `refunded` - Refundert

### Automatisk ordrebehandling
- Når betaling mottas via Stripe webhook:
  1. Ordre oppdateres til "paid" + "processing"
  2. Risk-evaluering kjøres
  3. E-postbekreftelse sendes til kunde
  4. Admin-notifikasjon sendes
  5. Ordre sendes til leverandør (hvis ikke flagged)

## 🔄 Database Migrasjoner

### Lokal utvikling
```bash
# Opprett ny migrasjon
npm run db:migrate

# Resett database (DANGER: sletter all data)
npx prisma migrate reset
```

### Produksjon
```bash
# Deploy migrasjoner til produksjon
npm run db:deploy
```

**VIKTIG:** Migrasjoner kjøres IKKE automatisk på Vercel. Kjør `db:deploy` manuelt etter schema-endringer.

## 🧪 Testing

### Lokal build test
```bash
npm run vercel-build
```

### Type checking
```bash
npx tsc --noEmit
```

### Linting
```bash
npm run lint
```

## 📝 Conventions

### Kode-stil
- TypeScript for all kode
- Server Components som standard (Client Components kun når nødvendig)
- `async` server components for data-fetching
- Error handling via `try/catch` og `logError` utility

### Naming
- Komponenter: PascalCase (`ProductCard.tsx`)
- Filer: kebab-case for routes (`order-confirmation/page.tsx`)
- Variabler: camelCase
- Konstanter: UPPER_SNAKE_CASE

### Database
- Bruk Prisma Client singleton fra `lib/prisma.ts`
- Wrap queries i `try/catch` eller `safeQuery` helper
- Bruk `storeId` filter for multi-store support

## 🐛 Known Issues

- Base64 bildeopplasting er midlertidig - bytt til CDN for produksjon
- UploadThing konfigurasjon krever ekstra setup
- Noen Prisma queries kan være suboptimale ved store datasett

## 📚 Ytterligere dokumentasjon

- [Teknisk oversikt](./docs/technical-overview.md)
- [Markedsføringspitch](./docs/marketing-pitch.md)

## 🤝 Bidrag

1. Fork repositoriet
2. Opprett feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit endringer (`git commit -m 'Add some AmazingFeature'`)
4. Push til branch (`git push origin feature/AmazingFeature`)
5. Åpne Pull Request

## 📄 Lisens

Dette prosjektet er privat og proprietært.

## 📞 Support

For spørsmål eller support, kontakt utviklerteamet.

---

**Laget med ❤️ ved hjelp av Next.js, Prisma, og Stripe**
