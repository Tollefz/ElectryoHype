# 🔧 Fikse .env filen - Eksakt Format

## Problem
Hvis Stripe keys ikke fungerer, kan det være ekstra anførselstegn i `.env` filen.

## ✅ Riktig format i .env filen:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require"
NEXTAUTH_SECRET="superlang-og-tilfeldig-streng-her"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@minbutikk.no"
ADMIN_PASSWORD="admin123"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9"
STRIPE_SECRET_KEY="sk_test_YOUR_KEY_HERE" # Sett inn Stripe test secret key (ikke commit ekte nøkkel)
```

## ❌ Vanlige feil:

### Feil 1: Ekstra anførselstegn
```env
# FEIL:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9""

# RIKTIG:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9"
```

### Feil 2: Manglende anførselstegn
```env
# FEIL:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9

# RIKTIG:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9"
```

### Feil 3: Mellomrom rundt =
```env
# FEIL:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_..."

# RIKTIG:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

### Feil 4: Linjeskift i key-en
```env
# FEIL:
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51STqfrG9K8kxw0K9akz9dJRhK
01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9"

# RIKTIG (hele key-en på én linje):
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51STqfrG9K8kxw0K9akz9dJRhK01sSkEZCAQmR1030vp7Vwky7Q0KqRBBLAQzwA8NL8Z0KugGiSUqc9tosighakK300yDiKjbW9"
```

## 📋 Sjekkliste for å fikse:

1. [ ] Åpne `.env` filen i `dropshipping-upgrade/.env`
2. [ ] Finn linjene med `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` og `STRIPE_SECRET_KEY`
3. [ ] Sjekk at hver key har ÉTT sett anførselstegn rundt seg (`"..."`)
4. [ ] Sjekk at det IKKE er mellomrom rundt `=` tegnet
5. [ ] Sjekk at hele key-en er på ÉN linje (ingen linjeskift)
6. [ ] Lagre filen
7. [ ] **RESTART dev serveren** (Ctrl+C og `npm run dev`)

## 🧪 Test etter fiksing:

Kjør dette scriptet for å verifisere:
```bash
node scripts/verify-stripe-keys.js
```

Eller sjekk i nettleseren - gå til checkout-siden og se om feilmeldingen er borte.

