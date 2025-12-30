# Import Providers

Dette modulet implementerer et provider-pattern for produktimport fra ulike kilder (Temu, Alibaba, etc.).

## Struktur

- `types.ts` - Interface og typer for providers
- `temu-provider.ts` - Temu import provider
- `provider-registry.ts` - Registry for å håndtere provider-valg og autodeteksjon
- `__tests__/` - Enhetstester

## Bruk

### Grunnleggende bruk

```typescript
import { getProviderRegistry } from "@/lib/providers";

const registry = getProviderRegistry();

// Auto-detect provider fra URL
const provider = registry.getProviderForUrl("https://www.temu.com/goods.html?goods_id=123");
if (provider) {
  const normalizedUrl = provider.normalizeUrl(url);
  const rawProduct = await provider.fetchProduct(normalizedUrl);
  const mappedProduct = provider.mapToProduct(rawProduct, normalizedUrl);
}
```

### Spesifisere provider

```typescript
// Bruk spesifikk provider
const provider = registry.getProviderForUrl(url, "temu");
```

## Implementere ny provider

1. Opprett en klasse som implementerer `ImportProvider` interface
2. Registrer provideren i `ProviderRegistry`:

```typescript
const registry = getProviderRegistry();
registry.register(new MyCustomProvider());
```

## Testing

For å kjøre testene, installer først Vitest:

```bash
npm install -D vitest @vitest/ui
```

Legg til i `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

Kjør testene:

```bash
npm test
```

## URL Normalisering

Providers normaliserer URLs ved å:
- Fjerne tracking-parametere (utm_source, ref, gclid, etc.)
- Beholde essensielle parametere (goods_id, top_gallery_url, etc.)
- Normalisere domene og protokoll

## Feilhåndtering

Hver URL får individuell feilhåndtering:
- `OK` - Produktet ble importert
- `Feil` - Feil ved import (med feilmelding)
- `Mangler data` - Produktet mangler nødvendig data

