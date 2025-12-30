# AlibabaProvider Implementasjon - Oppsummering

## Oversikt

`AlibabaProvider` er nå implementert og integrert i bulk-import systemet. Provideren bruker en optimalisert tilnærming med strukturert data først, og HTML scraping som fallback.

## Implementerte Filer

### 1. `lib/providers/alibaba-provider.ts`
Hovedimplementasjonen av AlibabaProvider med:
- URL normalisering (fjerner tracking params)
- Tre-lags datahenting (JSON-LD → Embedded JSON → HTML)
- Pris-intervall håndtering
- MOQ ekstraksjon
- Variant mapping
- Feilhåndtering

### 2. `lib/providers/__tests__/alibaba-provider.test.ts`
Enhetstester som dekker:
- URL normalisering
- JSON-LD parsing
- Pris-intervall parsing
- MOQ ekstraksjon
- Product mapping
- HTML fixture testing

### 3. `lib/providers/__tests__/fixtures/alibaba-product-sample.html`
HTML fixture for testing med:
- JSON-LD strukturert data
- HTML selectors
- Eksempel på komplett produktdata

### 4. `lib/providers/ALIBABA_PROVIDER_DOCS.md`
Komplett dokumentasjon med:
- Datahenting prioritering
- JSON paths og selectors
- URL normalisering
- Pris-håndtering
- MOQ håndtering
- Variants mapping
- Feilhåndtering

## Integrasjon

### Provider Registry
AlibabaProvider er automatisk registrert i `ProviderRegistry` og tilgjengelig for:
- Auto-deteksjon fra URL
- Eksplisitt valg via `getProvider("alibaba")`
- Bulk import via `getProviderForUrl(url, "alibaba")`

### Bulk Import
AlibabaProvider fungerer automatisk i bulk-import når:
- Bruker velger "Alibaba" i dropdown
- URL inneholder `alibaba.com` eller `1688.com`
- Provider sendes eksplisitt til API

## Datahenting - Prioritering

### 1. JSON-LD (Schema.org) ✅
- Søker i `<script type="application/ld+json">`
- Ekstraherer: title, description, images, price, specs, variants, MOQ
- **JSON Paths dokumentert i ALIBABA_PROVIDER_DOCS.md**

### 2. Embedded JSON ✅
- Søker etter: `window.__INITIAL_STATE__`, `window.__NEXT_DATA__`, etc.
- Rekursivt søk i nested JSON
- **Patterns dokumentert i ALIBABA_PROVIDER_DOCS.md**

### 3. HTML Scraping (Fallback) ✅
- Bruker cheerio (ikke Puppeteer)
- Selectors fra eksisterende AlibabaScraper
- **Selectors dokumentert i ALIBABA_PROVIDER_DOCS.md**

## Funksjonalitet

### ✅ URL Normalisering
- Fjerner tracking params (utm_*, ref, spm, etc.)
- Normaliserer domene og protokoll

### ✅ Pris-håndtering
- Støtter pris-intervaller (fromPrice/toPrice)
- Bruker laveste pris som standard
- Lagrer intervall i specs.Prisintervall

### ✅ MOQ (Minimum Order Quantity)
- Ekstraherer fra JSON-LD, embedded JSON, eller HTML
- Lagres i specs.MOQ og metadata.moq

### ✅ Variants
- Ekstraherer fra JSON-LD offers eller embedded JSON
- Oppretter standard variant hvis ingen finnes

### ✅ Feilhåndtering
- Tydelige feilmeldinger hvis ingen data
- Warnings for delvis data
- Minimum krav: title eller name

## Testing

Kjør tester med:
```bash
npm test lib/providers/__tests__/alibaba-provider.test.ts
```

Tester dekker:
- ✅ URL normalisering
- ✅ JSON-LD parsing
- ✅ Pris-intervall parsing
- ✅ MOQ ekstraksjon
- ✅ Product mapping
- ✅ HTML fixture parsing

## Bruk i Bulk Import

1. **Velg "Alibaba" i dropdown** i admin UI
2. **Lim inn Alibaba URLs** (én per linje)
3. **Klikk "Last URLs"** - validerer URLs
4. **Klikk "Importer Alle"** - bruker AlibabaProvider automatisk

## Eksempel

```typescript
import { getProviderRegistry } from "@/lib/providers";

const registry = getProviderRegistry();
const provider = registry.getProviderForUrl(
  "https://www.alibaba.com/product-detail/123.html",
  "alibaba"
);

if (provider) {
  const normalizedUrl = provider.normalizeUrl(url);
  const rawProduct = await provider.fetchProduct(normalizedUrl);
  const mappedProduct = provider.mapToProduct(rawProduct, normalizedUrl);
}
```

## Notater

- **Ingen Puppeteer**: Bruker axios + cheerio for bedre ytelse
- **Strukturert data først**: Bedre pålitelighet og ytelse
- **Fallback til HTML**: Sikrer at data hentes selv om strukturert data mangler
- **Kompatibel**: Fungerer med eksisterende bulk-import system
- **Dokumentert**: Alle selectors og JSON paths er dokumentert

## Neste Steg

Provideren er klar for produksjon og kan brukes umiddelbart i bulk-import. For å teste:

1. Gå til `/admin/products/temu-import`
2. Velg "Alibaba" i dropdown
3. Lim inn en Alibaba produkt-URL
4. Test import

