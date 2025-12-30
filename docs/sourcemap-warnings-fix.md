# Source Map Warnings Fix

## Problem

I development mode får vi spam av "Invalid source map... sourceMapURL could not be parsed" warnings fra:
- `.next/dev/server/chunks`
- `@prisma/client/runtime/library.js`

Dette er et kjent problem med Next.js/Turbopack og source maps, spesielt på Windows.

## Løsning

Vi har implementert en **dev-only** løsning som ikke påvirker production:

### 1. Disable Source Maps for Server Chunks (next.config.mjs)

```javascript
webpack: (config, { dev, isServer }) => {
  if (dev && isServer) {
    // Disable source maps for server-side chunks in development
    config.devtool = false;
  }
  return config;
}
```

Dette reduserer source map warnings fra server-side chunks.

### 2. Filter Console Errors (app/sourcemap-suppress.tsx)

En client component som filtrerer ut source map warnings fra `console.error` i development:

- Filtrerer meldinger som matcher source map warning patterns
- Fungerer kun i development (`NODE_ENV === "development"`)
- Restorerer original `console.error` ved unmount

## Hvordan det fungerer

1. **Webpack config** - Disabler source maps for server chunks i dev
2. **Client-side filter** - Filtrerer ut gjenværende source map warnings fra console

## Reversibel

For å reversere endringene:

1. **Fjern webpack config** fra `next.config.mjs`:
   ```javascript
   // Fjern denne delen:
   webpack: (config, { dev, isServer }) => {
     if (dev && isServer) {
       config.devtool = false;
     }
     return config;
   },
   ```

2. **Fjern SourceMapSuppress** fra `app/layout.tsx`:
   ```typescript
   // Fjern import:
   import { SourceMapSuppress } from "./sourcemap-suppress";
   
   // Fjern komponent:
   <SourceMapSuppress />
   ```

3. **Slett filen** `app/sourcemap-suppress.tsx`

## Production Impact

**Ingen påvirkning på production:**
- Webpack config kjører kun i development (`dev && isServer`)
- SourceMapSuppress komponenten gjør ingenting i production
- Production builds bruker fortsatt source maps som normalt

## Notater

- Dette er et kjent issue med Next.js/Turbopack
- Warnings påvirker ikke funksjonalitet
- Løsningen er kun for å redusere console spam i development
- Source maps i production builds er uendret

