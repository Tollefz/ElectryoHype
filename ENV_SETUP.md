# Stripe Keys Setup - Eksakt Format

## Kopier dette direkte til din `.env` fil:

```env
# Stripe Test Keys (fra Stripe Dashboard - Nov 15)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9"
STRIPE_SECRET_KEY="sk_test_YOUR_KEY_HERE" # Sett inn Stripe test secret key (ikke commit ekte nøkkel)
```

## Viktige punkter:

1. **Ingen mellomrom** rundt `=` tegnet
2. **Anførselstegn** rundt hele key-en (`"..."`)
3. **Hver key på én linje** - ingen linjeskift i selve key-en
4. **Ingen mellomrom** i selve key-en

## Sjekkliste:

- [ ] Kopierer du eksakt fra linjene over (inkludert anførselstegn)
- [ ] Ingen mellomrom rundt `=`
- [ ] Hver key er på én hel linje
- [ ] Du lagrer `.env` filen
- [ ] Du restarter dev serveren (Ctrl+C og `npm run dev`)

## Test:

Etter restart, kjør:
```bash
node scripts/verify-stripe-keys.js
```

Eller test i checkout-siden - du skal ikke lenger se "Invalid API Key" feil.

