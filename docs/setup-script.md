# Setup Script - npm run setup

## Oversikt

`npm run setup` er en lokal bootstrap-kommando som automatiserer initial setup av prosjektet.

## Hva gjør scriptet?

1. **Kopierer .env.example til .env** (hvis .env mangler)
   - Hvis .env.example ikke finnes, oppretter den en basic .env fil
   - Gir tydelig melding om at .env må oppdateres med faktiske verdier

2. **Kjører `prisma generate`**
   - Genererer Prisma Client basert på schema
   - Nødvendig for at Prisma queries skal fungere

3. **Kjører `prisma migrate dev`** (kun for lokale databaser)
   - Detekterer automatisk om DATABASE_URL peker på lokal database
   - Kjører migrasjoner kun for localhost/127.0.0.1
   - For remote databases (Neon), gir instruksjoner om å kjøre migrasjoner manuelt

4. **Validerer DATABASE_URL**
   - Sjekker om DATABASE_URL er satt og ikke er placeholder
   - Gir tydelige instruksjoner hvis DATABASE_URL mangler

## Bruk

```bash
npm run setup
```

## Eksempel Output

```
🚀 Starting ElectryoHype setup...

📝 Copying .env.example to .env...
✅ Created .env file from .env.example
⚠️  Please update .env with your actual values!
✅ DATABASE_URL is configured

📦 Prisma generate...
✅ Prisma generate completed

📦 Detected local database, running migrations...
📦 Prisma migrate dev...
✅ Prisma migrate dev completed

==================================================
✅ Setup complete!
==================================================

📝 Next steps:
   1. Verify .env file has all required values
   2. Run 'npm run dev' to start the development server
   3. If using a remote database, run 'npm run db:migrate' to apply migrations

📚 See docs/local-setup.md for detailed instructions
```

## Lokal Database Deteksjon

Scriptet detekterer automatisk om DATABASE_URL peker på lokal database ved å sjekke for:
- `localhost`
- `127.0.0.1`
- `:5432` (standard PostgreSQL port) uten `neon.tech`
- `postgresql://postgres@localhost`

For lokale databaser kjører scriptet automatisk `prisma migrate dev`.

For remote databases (Neon, etc.) gir scriptet instruksjoner om å kjøre migrasjoner manuelt.

## Feilhåndtering

### DATABASE_URL mangler eller er placeholder

Hvis DATABASE_URL mangler eller inneholder placeholder-verdier:
- Scriptet kjører fortsatt `prisma generate`
- Gir tydelige instruksjoner for å fikse DATABASE_URL
- Avslutter med exit code 0 (partial success)

### Prisma generate feiler

Hvis `prisma generate` feiler:
- Scriptet avslutter med exit code 1
- Gir feilmelding
- Brukeren må fikse problemet og kjøre `npm run setup` igjen

### Prisma migrate feiler

Hvis `prisma migrate dev` feiler (kun for lokale databaser):
- Scriptet fortsetter og gir warning
- Foreslår å kjøre `npm run db:migrate` manuelt
- Setup er fortsatt "mostly complete"

## Windows Support

Scriptet er skrevet i Node.js ESM (`.mjs`) og bruker native Node.js APIs:
- `fs` for filoperasjoner (fungerer på Windows)
- `child_process.execSync` for å kjøre kommandoer (fungerer på Windows)
- Ingen shell-spesifikke kommandoer

## Reversibel

For å reversere:
1. Slett `.env` filen (hvis den ble opprettet av scriptet)
2. Fjern `"setup": "node scripts/setup.mjs"` fra `package.json`
3. Slett `scripts/setup.mjs`

## Notater

- Scriptet er idempotent - kan kjøres flere ganger uten problemer
- Hvis .env allerede eksisterer, kopierer den ikke .env.example
- Scriptet sjekker ikke om .env har riktige verdier, bare om den eksisterer
- For production, bruk `npm run db:deploy` i stedet for `npm run db:migrate`

