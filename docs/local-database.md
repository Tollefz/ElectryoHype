# Lokal database for utvikling

Neon Free Plan har lav data-transfer-kvote. **Utvikling på localhost bør ikke bruke Neon** hvis du kan unngå det.

## Anbefalt oppsett

1. Start Postgres:

```bash
docker compose -f docker-compose.dev.yml up -d
```

2. Sett i `.env.local` (overstyrer Neon i `.env`):

```env
DATABASE_URL="postgresql://electrohype:electrohype@localhost:5432/electrohype?schema=public"
PRISMA_SKIP_CONNECT=0
```

3. Synk schema (tom lokal DB — **ikke** produksjonsdata):

```bash
npx prisma db push
npm run seed
```

4. Start appen:

```bash
npm run dev
```

## Viktig

- Ikke kjør destruktive migreringer mot Neon fra localhost «for å teste».
- Bytt tilbake til Neon `DATABASE_URL` kun når du trenger produksjonslignende data.
- `DATABASE_URL` styrer alt — ingen hardkodet Neon-host i koden.

## Uten Docker

Installer PostgreSQL 16 lokalt og opprett database/bruker `electrohype` / `electrohype`, deretter samme `DATABASE_URL` som over.
