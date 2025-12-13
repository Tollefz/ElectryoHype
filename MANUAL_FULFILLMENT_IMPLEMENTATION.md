# Manual Fulfillment Flow Implementation

## Summary

Implemented a complete manual fulfillment flow for orders after Stripe payment. Orders are now created from webhook events, stored in the database, visible in admin, and customers receive confirmation emails with manual fulfillment disclosure.

## Changes Made

### 1. Webhook Handler (`app/api/webhooks/stripe/route.ts`)
- **Updated `checkout.session.completed` handler** to:
  - Check for existing orders by `stripeSessionId` to prevent duplicates
  - Create orders from checkout session if they don't exist (retrieves line items, customer details, shipping address)
  - Set initial `fulfillmentStatus` to `NEW` for manual fulfillment
  - Send order confirmation and admin notification emails (non-blocking, tracks status in DB)
  - **DO NOT** automatically send orders to suppliers (manual process)
  - **Email failures do NOT block order creation** - webhook always returns 200 if order is created

### 2. Prisma Schema (`prisma/schema.prisma`)
- Added `FulfillmentStatus` enum: `NEW`, `ORDERED_FROM_SUPPLIER`, `SHIPPED`, `DELIVERED`, `CANCELLED`
- Added `EmailStatus` enum: `NOT_SENT`, `SENT`, `FAILED`
- Added `fulfillmentStatus` field to Order (single source of truth)
- Added email tracking fields:
  - `customerEmailStatus`: EmailStatus
  - `customerEmailLastError`: string (nullable, max 500 chars)
  - `customerEmailSentAt`: DateTime (nullable)
  - `adminEmailStatus`: EmailStatus (optional)
  - `adminEmailSentAt`: DateTime (nullable)
- Added `@unique` constraint on `stripeSessionId` to prevent duplicate orders
- Added indexes on `fulfillmentStatus` and `customerEmailStatus` for filtering
- Kept `status` (OrderStatus) for backward compatibility (deprecated)
- Kept `supplierOrderStatus` as internal note only (not used for UI truth)

### 3. Email System (`lib/email.ts`)
- **Updated `sendOrderConfirmation`** to:
  - Track email status in database (SENT/FAILED/NOT_SENT)
  - Store error messages (truncated to 500 chars)
  - Never throw errors (returns `{ success: boolean, error?: string }`)
  - Update `customerEmailSentAt` on success
- **Updated `sendAdminNotification`** similarly
- Email failures are logged but do not block order creation

### 4. Email Template (`emails/order-confirmation.tsx`)
- Added manual fulfillment disclosure section
- Updated delivery estimate to "5–12 virkedager (varierer)"
- Added links to terms and returns pages
- Updated footer to "ElektroHype AS"

### 5. Order Confirmation Page (`app/order-confirmation/OrderConfirmationClient.tsx`)
- Added blue info box with manual fulfillment disclosure
- Updated "Hva skjer nå?" section to mention manual processing
- Updated delivery estimate text

### 6. Admin Order Management
- **Orders List (`/admin/orders`)**:
  - Filters by `fulfillmentStatus` (single source of truth)
  - Displays fulfillment status badges
- **Order Detail (`/admin/orders/[id]`)**:
  - Uses `fulfillmentStatus` dropdown with clear labels
  - Quick action buttons:
    - "Marker som bestilt hos leverandør" → `ORDERED_FROM_SUPPLIER`
    - "Marker som sendt" → `SHIPPED`
    - "Marker som fullført" → `DELIVERED`
    - "Avbryt ordre" → `CANCELLED`
  - Email status display with retry button
  - Shows email error messages (truncated, no secrets)

### 7. Shipping Messaging (`lib/shippingCopy.ts` + `components/DeliveryInfo.tsx`)
- Single source of truth for all shipping messages
- Replaced misleading "Sendes i dag" / "På lager" claims
- Consistent messaging: "5–12 virkedager (varierer)"
- "Vi behandler bestillingen manuelt etter betaling"
- Updated in:
  - Product detail pages
  - Product cards
  - Terms page
  - Shipping page
  - FAQ page

## Status Workflow (Single Source of Truth)

Orders follow this manual workflow using `fulfillmentStatus`:

- **NEW**: Order created, payment received
- **ORDERED_FROM_SUPPLIER**: Admin has placed order with supplier
- **SHIPPED**: Package shipped, tracking added
- **DELIVERED**: Order completed
- **CANCELLED**: Order cancelled

**Note**: `supplierOrderStatus` is kept for internal notes only and is NOT used for UI display or filtering.

## Email Status Tracking

- **NOT_SENT**: Email not yet sent (default)
- **SENT**: Email successfully sent (includes `customerEmailSentAt` timestamp)
- **FAILED**: Email failed (includes `customerEmailLastError` message, truncated to 500 chars)

Admin can retry failed emails via "Send ordrebekreftelse på nytt" button.

## Delivery Messaging Rules

All customer-facing shipping messages must:
- Use "5–12 virkedager (varierer)" for delivery estimates
- Mention "Vi behandler bestillingen manuelt etter betaling"
- Avoid "Sendes i dag" unless truly shipped same day
- Use "Tilgjengelig" instead of "På lager" for stock status
- Be consistent across all pages (product pages, cart, checkout, legal pages)

See `lib/shippingCopy.ts` for single source of truth.

## Database Migration Required

Run Prisma migration to add fulfillment status and email tracking:

```bash
npx prisma migrate dev --name add_fulfillment_status_and_email_tracking
```

Or in production:
```bash
npx prisma migrate deploy
```

**Migration includes:**
- `FulfillmentStatus` enum
- `EmailStatus` enum
- `fulfillmentStatus` field on Order
- Email status tracking fields
- Unique constraint on `stripeSessionId`
- Indexes for filtering

## Environment Variables

Ensure these are set:
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
- `RESEND_API_KEY`: Resend API key for emails
- `EMAIL_FROM`: Email sender (e.g., "ElectroHypeX <noreply@electrohypex.com>")
- `ADMIN_EMAIL`: Admin email for notifications
- `DATABASE_URL`: PostgreSQL connection string

## Testing

### Local Testing
1. Use Stripe CLI to forward webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

2. Trigger test event:
   ```bash
   stripe trigger checkout.session.completed
   ```

3. Check:
   - Order created in database
   - Email sent (check console logs in test mode)
   - Order visible in `/admin/orders`

### Production Testing
1. Create a test checkout session in Stripe Dashboard
2. Complete payment
3. Verify webhook received (check Stripe Dashboard → Webhooks → Events)
4. Check order in admin panel
5. Verify customer received email

## Important Notes

- **Manual Fulfillment**: Orders are NOT automatically sent to suppliers. Admin must manually process each order.
- **Single Source of Truth**: `fulfillmentStatus` is the only status used in UI and logic. `status` (OrderStatus) is deprecated but kept for backward compatibility.
- **Email Robustness**: Email failures do NOT block order creation. Webhook always returns 200 if order is created successfully, even if emails fail.
- **Email Retry**: Admin can retry failed emails via button in order detail page. Status is tracked in database.
- **Duplicate Prevention**: `stripeSessionId` is unique, preventing duplicate orders from the same checkout session.
- **Honest Messaging**: All misleading "Sendes i dag" / "På lager" claims removed. Consistent "5–12 virkedager" messaging.
- **Legal Compliance**: No claims about automatic supplier ordering. ElektroHype AS is the seller of record.

## Files Changed

### Core Implementation
1. `prisma/schema.prisma` - Added fulfillmentStatus enum, email status fields, indexes
2. `app/api/webhooks/stripe/route.ts` - Uses fulfillmentStatus, handles email failures gracefully
3. `lib/email.ts` - Tracks email status in DB, never throws errors
4. `app/api/admin/orders/[id]/route.ts` - Accepts fulfillmentStatus, maps to legacy status
5. `app/api/admin/orders/[id]/retry-email/route.ts` - New endpoint for email retry

### Admin UI
6. `app/admin/(protected)/orders/page.tsx` - Filters and displays by fulfillmentStatus
7. `app/admin/(protected)/orders/[id]/page.tsx` - Shows fulfillmentStatus badge
8. `app/admin/(protected)/orders/[id]/OrderDetailsClient.tsx` - fulfillmentStatus dropdown, email status display, retry button

### Customer-Facing
9. `emails/order-confirmation.tsx` - Manual fulfillment disclosure
10. `app/order-confirmation/OrderConfirmationClient.tsx` - Manual fulfillment disclosure
11. `lib/shippingCopy.ts` - Single source of truth for shipping messages
12. `components/DeliveryInfo.tsx` - Reusable delivery info component
13. `app/products/[slug]/page.tsx` - Replaced misleading shipping messages
14. `components/ProductCard.tsx` - Replaced misleading shipping messages
15. `app/vilkar/page.tsx` - Updated delivery times
16. `app/frakt/page.tsx` - Updated delivery promises
17. `app/faq/page.tsx` - Updated delivery times

### Order Creation
18. `app/api/checkout/create-payment-intent/route.ts` - Sets fulfillmentStatus on order creation

## Next Steps

1. Run Prisma migration
2. Configure Stripe webhook endpoint in production
3. Test end-to-end flow
4. Train admin team on manual order processing workflow

