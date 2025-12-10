# Teknisk Oversikt - ElektroHype E-commerce Platform

## Arkitektur

### Høy-nivå oversikt

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js App Router                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Frontend   │  │  API Routes  │  │ Server Comp  │     │
│  │  (React 18)  │  │  (REST API)  │  │  (Data Fetch)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Prisma     │  │   NextAuth   │  │   Stripe     │     │
│  │   (ORM)      │  │   (Auth)     │  │  (Payment)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Neon DB    │  │   Vercel     │  │  UploadThing │     │
│  │ (PostgreSQL) │  │ (Hosting)    │  │  (Images)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## App Router Struktur

### Mappestruktur

```
app/
├── (root)/
│   ├── page.tsx              # Hjemmeside
│   ├── products/
│   │   ├── page.tsx          # Produktliste
│   │   └── [slug]/
│   │       └── page.tsx      # Produktdetaljer
│   ├── tilbud/
│   │   └── page.tsx          # Tilbudsside
│   ├── cart/
│   │   └── page.tsx          # Handlekurv
│   ├── checkout/
│   │   └── page.tsx          # Checkout flow
│   └── order-confirmation/
│       └── page.tsx          # Ordrebekreftelse
│
├── admin/
│   └── (protected)/
│       ├── layout.tsx        # Auth guard
│       ├── dashboard/
│       │   └── page.tsx      # Admin dashboard
│       ├── products/
│       │   ├── page.tsx      # Produktliste
│       │   ├── new/
│       │   │   └── page.tsx  # Nytt produkt
│       │   └── edit/[id]/
│       │       └── page.tsx  # Rediger produkt
│       └── orders/
│           ├── page.tsx      # Ordreliste
│           └── [id]/
│               └── page.tsx  # Ordredetaljer
│
└── api/
    ├── admin/
    │   ├── products/
    │   │   ├── route.ts      # GET, POST
    │   │   └── [id]/
    │   │       └── route.ts  # GET, PATCH, DELETE
    │   └── orders/
    │       └── [id]/
    │           └── route.ts  # GET, PATCH
    ├── checkout/
    │   └── route.ts          # Stripe Checkout Session
    ├── uploadthing/
    │   ├── core.ts           # UploadThing config
    │   └── route.ts          # Upload handler
    └── webhooks/
        └── stripe/
            └── route.ts      # Stripe webhook handler
```

## Datamodell

### Core Models

#### Product
```prisma
model Product {
  id                String           @id @default(cuid())
  name              String
  slug              String           @unique
  storeId           String?
  price             Float
  compareAtPrice    Float?
  images            String           // JSON array
  category          String?
  isActive          Boolean          @default(true)
  variants          ProductVariant[]
  orderItems        OrderItem[]
  // ... flere felt
}
```

#### Order
```prisma
model Order {
  id                  String         @id @default(cuid())
  orderNumber         String         @unique
  storeId             String?
  customerId          String?
  status              OrderStatus    @default(pending)
  paymentStatus       PaymentStatus  @default(pending)
  paymentIntentId     String?
  stripeSessionId     String?        // Stripe Checkout Session ID
  customerEmail       String?        // Email fra checkout
  items               Json           // Snapshot av cart items
  subtotal            Float
  shippingCost        Float
  total               Float
  shippingAddress     Json
  orderItems          OrderItem[]
  // ... flere felt
}
```

#### Customer
```prisma
model Customer {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  phone     String?
  storeId   String?
  orders    Order[]
  // ...
}
```

### Relasjoner

- `Customer` → `Order[]` (one-to-many)
- `Order` → `OrderItem[]` (one-to-many)
- `OrderItem` → `Product` (many-to-one)
- `Product` → `ProductVariant[]` (one-to-many)

## API Endepunkter

### Admin API

#### Produkter
- `GET /api/admin/products` - Liste produkter (med pagination, search, filter)
- `POST /api/admin/products` - Opprett produkt
- `GET /api/admin/products/[id]` - Hent produkt
- `PATCH /api/admin/products/[id]` - Oppdater produkt
- `DELETE /api/admin/products/[id]` - Slett produkt

#### Ordrer
- `GET /api/admin/orders/[id]` - Hent ordredetaljer
- `PATCH /api/admin/orders/[id]` - Oppdater ordrestatus

### Public API

#### Checkout
- `POST /api/checkout` - Opprett Stripe Checkout Session

#### Ordrer
- `GET /api/orders/by-session?sessionId=...` - Hent ordre via Stripe session ID
- `GET /api/orders/by-payment-intent?paymentIntentId=...` - Hent ordre via payment intent

#### Upload
- `POST /api/upload/image` - Last opp bilde (admin only)

### Webhooks
- `POST /api/webhooks/stripe` - Stripe webhook handler

## Prisma Layout

### Client Singleton Pattern

```typescript
// lib/prisma.ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Hvorfor:**
- Forhindrer multiple Prisma Client instances i development
- Optimal for Vercel serverless (singleton per function instance)
- Automatisk connection pooling

### Query Patterns

#### Safe Query Helper
```typescript
// lib/utils/safe-query.ts
export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(error, label);
    return fallback;
  }
}
```

#### StoreId Fallback Pattern
```typescript
// Alle produktqueries bruker denne pattern:
let products = await prisma.product.findMany({
  where: { isActive: true, storeId: primaryStoreId }
});

if (products.length === 0 && primaryStoreId !== "default-store") {
  products = await prisma.product.findMany({
    where: { isActive: true, storeId: "default-store" }
  });
}
```

## Auth Flow

### NextAuth Konfigurasjon

```typescript
// lib/auth.ts
export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      credentials: {
        email: { type: "email" },
        password: { type: "password" }
      },
      async authorize(credentials) {
        // Valider mot database
        // Returner user object
      }
    })
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" }
};
```

### Server-side Guard

```typescript
// app/admin/layout.tsx
export default async function AdminLayout({ children }) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/admin/login");
  }
  return <>{children}</>;
}
```

**Fjernet:** `middleware.ts` (deprecated i Next.js 16)

## Cart Flow

### State Management

```typescript
// lib/cart-context.tsx
export function CartProvider({ children }) {
  const [items, setItems] = useState<CartItem[]>([]);
  
  // localStorage sync
  useEffect(() => {
    // Load from localStorage
  }, []);
  
  useEffect(() => {
    // Save to localStorage
  }, [items]);
  
  // addToCart, removeFromCart, updateQuantity, clearCart
}
```

### Cart Item Structure
```typescript
interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  slug?: string;
  variantId?: string;
  variantName?: string;
}
```

## Checkout Flow

### Stripe Checkout Session Flow

```
1. Kunde klikker "Gå til kassen" i /cart
   ↓
2. POST /api/checkout
   - Validerer cart items
   - Oppretter Order i database (status: pending)
   - Oppretter Stripe Checkout Session
   - Returnerer session.url
   ↓
3. Redirect til Stripe Checkout
   ↓
4. Kunde betaler
   ↓
5. Stripe webhook: checkout.session.completed
   ↓
6. POST /api/webhooks/stripe
   - Oppdaterer Order (status: paid, paymentStatus: paid)
   - Risk evaluation
   - Sender e-postbekreftelse
   - Trigger leverandørordre
   ↓
7. Redirect til /order-confirmation?session_id=...
   ↓
8. GET /api/orders/by-session?sessionId=...
   - Henter ordre og viser bekreftelse
```

### Order Creation

```typescript
// app/api/checkout/route.ts
const order = await prisma.order.create({
  data: {
    orderNumber: `ORD-${Date.now()}-${nanoid(6)}`,
    storeId,
    customerId,
    status: "pending",
    paymentStatus: "pending",
    items: JSON.stringify(items),
    subtotal,
    shippingCost,
    total,
    shippingAddress: JSON.stringify(shippingAddress),
    customerEmail,
  }
});

const session = await stripe.checkout.sessions.create({
  // ...
  metadata: {
    orderId: order.id,
    orderNumber: order.orderNumber,
  }
});

await prisma.order.update({
  where: { id: order.id },
  data: { stripeSessionId: session.id }
});
```

## Webhooks

### Stripe Webhook Handler

```typescript
// app/api/webhooks/stripe/route.ts
export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("stripe-signature");
  
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
  
  switch (event.type) {
    case "checkout.session.completed":
      // Oppdater ordre til "paid"
      // Risk evaluation
      // Send e-post
      // Trigger leverandørordre
      break;
    case "payment_intent.succeeded":
      // Alternativ flow (Payment Intent)
      break;
  }
}
```

### Webhook Events Håndtert

- `checkout.session.completed` - Primær checkout flow
- `payment_intent.succeeded` - Alternativ payment flow
- `payment_intent.payment_failed` - Feil håndtering

## Deployment Prosess

### Vercel Deployment

1. **Build Command:** `npm run vercel-build` (kun `next build`, ingen Prisma migrasjoner)
2. **Environment Variables:**
   - `DATABASE_URL` - Neon POOLER connection string
   - `STRIPE_SECRET_KEY` - Stripe secret key
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
   - `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
   - `NEXTAUTH_SECRET` - NextAuth secret
   - `NEXTAUTH_URL` - Production URL

3. **Database Migrasjoner:**
   - Kjør MANUELT: `npm run db:deploy` (ikke automatisk i build)

### Neon Database Setup

- **Lokal utvikling:** Bruk PRIMARY (direct) connection string
- **Vercel produksjon:** Bruk POOLER connection string
- **Migrasjoner:** Kjør lokalt med PRIMARY connection

## Logging & Error Handling

### Global Logger

```typescript
// lib/utils/logger.ts
export function logError(err: any, ctx: string) {
  console.error("🔥 ERROR:", ctx, err?.message || err);
}

export function logWarning(msg: string, ctx: string) {
  console.warn("⚠️ WARNING:", ctx, msg);
}

export function logInfo(msg: string, ctx: string) {
  console.info("ℹ️ INFO:", ctx, msg);
}
```

### Error Boundaries

- Next.js `error.tsx` for route-level error handling
- `try/catch` rundt alle Prisma queries
- `safeQuery` helper for graceful fallbacks

### Error Response Format

```typescript
// API routes
return NextResponse.json(
  { ok: false, error: "Beskrivende feilmelding" },
  { status: 500 }
);

// Success
return NextResponse.json(
  { ok: true, data: {...} }
);
```

## Caching Strategi

### ISR (Incremental Static Regeneration)

```typescript
// app/products/page.tsx
export const revalidate = 60; // Revalidate every 60 seconds
```

**Brukt på:**
- `/` (hjemmeside)
- `/products` (produktliste)
- `/products/[slug]` (produktdetaljer)
- `/tilbud` (tilbudsside)

### Next.js Image Optimization

```typescript
<Image
  src={imageUrl}
  alt="Produktnavn"
  width={600}
  height={600}
  unoptimized={false} // Next.js optimaliserer automatisk
/>
```

### API Route Caching

- Ingen eksplisitt caching på API routes (serverless functions)
- Prisma connection pooling håndterer database connections
- Vercel Edge Network cacher statiske assets

## Performance Optimaliseringer

1. **ISR** - 60s revalidate på produktsider
2. **Next/Image** - Automatisk bildeoptimalisering
3. **Server Components** - Minimal JavaScript bundle
4. **Lazy Loading** - Client components lastes kun når nødvendig
5. **Connection Pooling** - Neon POOLER for Vercel
6. **Error Boundaries** - Forhindrer full app crash

## Sikkerhet

1. **Authentication:** NextAuth JWT strategy
2. **Authorization:** Server-side guards i layouts
3. **Input Validation:** Zod schemas
4. **SQL Injection:** Prisma prepared statements
5. **XSS:** React auto-escaping
6. **CSRF:** Next.js built-in protection
7. **Webhook Security:** Stripe signature validation

## Skaleringspotensial

### Database
- Neon PostgreSQL støtter auto-scaling
- Connection pooling via POOLER endpoint
- Indexes på kritiske queries (storeId, category, isActive)

### Application
- Vercel serverless auto-scales
- Edge Network for global CDN
- ISR reduserer database load

### Limits
- Vercel: 100GB bandwidth/month (free tier)
- Neon: 0.5GB storage (free tier)
- Stripe: Standard rate limits

---

**Dokumentasjon oppdatert:** 2025-01-XX

