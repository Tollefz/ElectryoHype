# Prisma Runtime Requirements

## ⚠️ Important: Prisma Requires Node.js Runtime

Prisma Client **does not work** in Edge Runtime. All routes and pages that use Prisma must use Node.js runtime (which is the default in Next.js).

## Current Status

✅ **All routes are using Node.js runtime** (no `export const runtime = "edge"` found)

✅ **Prisma singleton pattern is correctly implemented** in `lib/prisma.ts`

## Prisma Singleton Pattern

The Prisma Client is set up as a singleton in `lib/prisma.ts`:

```typescript
// Development: Reuse instance via globalThis (prevents multiple instances during hot reload)
// Production: Vercel creates new instances per serverless function (this is fine)

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

## If You See "Invalid prisma.product.findMany invocation"

This error typically means:

1. **Route is using Edge Runtime** (most common)
   - **Fix:** Remove `export const runtime = "edge"` from the route file
   - **Or:** Move Prisma queries to a separate API route that uses Node.js runtime

2. **Prisma Client not properly initialized**
   - **Fix:** Check that `DATABASE_URL` is set in `.env`
   - **Fix:** Run `npx prisma generate` to regenerate Prisma Client

3. **Multiple Prisma instances in development**
   - **Fix:** The singleton pattern should prevent this, but restart dev server if needed

## Routes Using Prisma

All these routes use Prisma and must use Node.js runtime:

- `app/page.tsx` - Homepage (Server Component)
- `app/products/page.tsx` - Products listing
- `app/products/[slug]/page.tsx` - Product details
- `app/api/admin/**` - All admin API routes
- `app/api/checkout/**` - Checkout routes
- `app/api/orders/**` - Order routes
- `app/api/webhooks/stripe/route.ts` - Stripe webhooks
- And many more...

## Verifying Runtime

To check if a route is using Edge Runtime:

```bash
# Search for edge runtime declarations
grep -r "export const runtime" app/
```

If you find any routes with `export const runtime = "edge"` that also use Prisma, you must either:

1. **Remove the edge runtime declaration** (recommended)
2. **Move Prisma queries to a separate API route** that uses Node.js runtime

## Best Practices

1. **Default to Node.js runtime** - Only use Edge Runtime for routes that don't need database access
2. **Use Prisma singleton** - Always import from `@/lib/prisma`, never create new instances
3. **Test in development** - The singleton pattern prevents issues during hot reload
4. **Check error messages** - "Invalid prisma.* invocation" usually means Edge Runtime issue

## Middleware

The `middleware.ts` file does NOT use Prisma, so it can use Edge Runtime if needed. Currently it uses the default (Node.js), which is fine.

