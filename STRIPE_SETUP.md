# Stripe Setup Guide

## Test Mode (Development)

For testing og utvikling, bruk **Test API Keys**:

1. Gå til: https://dashboard.stripe.com/test/apikeys
2. Kopier keys til `.env`:

```env
# Stripe Test Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
```

**Viktig:**
- Test keys fungerer ikke for ekte betalinger
- Du kan teste med test kort: `4242 4242 4242 4242`
- CVV: 123 | Utløpsdato: Hvilken som helst fremtidig dato

---

## Production Mode (Live)

Når du er klar for produksjon:

### 1. Krav for produksjon:
- ✅ Organisasjonsnummer
- ✅ Bankkonto registrert i Stripe
- ✅ Identity verification (pålogging med BankID)
- ✅ Bunnlinje informasjon (kontaktinfo, etc.)

### 2. Hent Production Keys:

1. Gå til: https://dashboard.stripe.com/apikeys
2. **Bytt til Production mode** (toggle øverst til høyre)
3. Kopier production keys

### 3. Oppdater `.env` for produksjon:

```env
# Stripe Production Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..." # Viktig for webhooks i produksjon!
```

### 4. Konfigurer Stripe Webhook:

1. Gå til: https://dashboard.stripe.com/webhooks
2. Klikk "Add endpoint"
3. Endpoint URL: `https://din-domene.com/api/webhooks/stripe`
4. Velg events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Kopier webhook secret til `.env`

### 5. Test produksjons-oppsettet:

- Start med små beløp
- Test at webhooks fungerer
- Verifiser at betalinger kommer gjennom
- Sjekk at ordrer opprettes i database

---

## Troubleshooting Test Keys

Hvis test keys ikke fungerer:

### Sjekkliste:
- [ ] Key-en er kopiert korrekt (ingen tegn mangler)
- [ ] Ingen mellomrom eller linjeskift i key-en
- [ ] `.env` filen har riktig format (variabelnavn = "key")
- [ ] Dev serveren er restartet etter `.env` endring
- [ ] Key-en starter med `pk_test_` (publishable) eller `sk_test_` (secret)
- [ ] Key-en er fra samme Stripe konto

### Vanlige feil:

**"Invalid API Key":**
- Key-en er feil kopiert eller har whitespace
- Restart serveren

**"Key format invalid":**
- Key-en starter ikke med `pk_test_` eller `sk_test_`
- Sjekk at du kopierte hele key-en

**"Key not found":**
- Key-en er fra feil Stripe konto
- Sjekk at du er logget inn på riktig konto

---

## Når du går live:

1. **Ikke gå live før:**
   - Test-keys fungerer perfekt
   - Du har testet hele checkout-flowet
   - Du har testet webhooks
   - Du har testet order processing

2. **Etter produksjon-oppsett:**
   - Test med små beløp først
   - Monitor Stripe Dashboard aktivt
   - Sjekk at webhooks kommer gjennom
   - Verifiser at ordrer opprettes korrekt

3. **Sikkerhet:**
   - Bruk aldri produksjons-keys i utvikling
   - Hold secrets trygge
   - Bruk environment variables (ikke commit `.env` til git)

