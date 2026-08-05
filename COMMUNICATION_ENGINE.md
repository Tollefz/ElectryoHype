# Communication Engine

International **communication motor** for ElectroHypeX (and any store vertical).

Not “Norwegian emails with a flag.”  
**One engine** → any locale via templates.

---

## Flow

```
customer.locale
      ↓
Locale Engine          →  nb-NO / en-US / de-DE / …
      ↓
Language Profile       →  Norsk / English / Deutsch
      ↓
Template Engine        →  subject + text (+ optional html)
      ↓
Notification Engine    →  email | sms | push | in_app
```

**No AI translation at send time.** Catalogs are human-authored. AI may later *propose* better copy through Approval Gate — never auto-rewrite live mail.

---

## Modules

```
lib/communication/
  language-profile.ts      # locale → display name, direction, dateLocale
  locale-engine.ts         # resolve customer.locale → BCP 47
  template-engine.ts       # {{vars}} + {{#optional}} blocks
  catalog.ts               # message catalogs (nb-NO, en-US, de-DE, …)
  notification-engine.ts   # channel delivery (Resend email today)
  communication-engine.ts  # compose + order event façade
  types.ts
  index.ts
```

---

## Locale resolution (priority)

1. `Customer.locale`
2. Order locale (future snapshot)
3. `Accept-Language`
4. Shipping country → soft default (NO→nb-NO, DE→de-DE, …)
5. Store default (`COMMUNICATION_DEFAULT_LOCALE` / `NEXT_PUBLIC_DEFAULT_LOCALE`)
6. Fallback: `en-US`

```ts
import { resolveLocale, getLanguageProfile } from "@/lib/communication";

const locale = resolveLocale({ customerLocale: customer.locale, countryCode: "DE" });
// "de-DE"
getLanguageProfile(locale).displayName;
// "Deutsch"
```

---

## Message types (same motor)

| Type | Use |
|------|-----|
| `order_confirmation` | Ordrebekreftelse |
| `payment_approved` | Betaling mottatt |
| `shipping` | Forsendelse / tracking |
| `delay` | Forsinkelse |
| `delivered` | Levering |
| `reminder` | Påminnelser |
| `problem` | Oppfølging / avvik |

Add a locale by registering a language profile + template — not by forking senders.

```ts
registerLanguageProfile({ locale: "fr-FR", language: "fr", displayName: "Français", ... });
registerTemplate("shipping", "fr-FR", { subject: "...", text: "..." });
```

---

## Order automation

`lib/orders/notifications.ts` → `communicateOrderEvent()`:

- Resolves locale from customer
- Renders the correct catalog
- Sends email (rich React Email still used for confirmation/shipping HTML; **subjects** come from Locale/Template Engine)
- Delay / delivered / reminder / problem use catalog HTML/text via Notification Engine

---

## Customer.locale

Prisma:

```prisma
locale String?  // BCP 47, e.g. nb-NO, en-US, de-DE
```

Run migrate when ready:

```bash
npx prisma migrate dev --name customer_locale
```

Until set, Locale Engine uses country / store default.

---

## What not to do

- Hardcode `Ordrebekreftelse` in new call sites
- Call Resend with free-form language strings
- Use LLM to translate at send time
- Build a separate “Norwegian mailer” and “English mailer”

---

## Extending to BeautyHype / PlantHype / …

Same engine. Change:

1. Store default locale  
2. Template catalog tone (registerTemplate)  
3. `SITE_CONFIG.name` / from-address  

Identity of the **store** comes from profile; identity of the **language** comes from Locale Engine.
