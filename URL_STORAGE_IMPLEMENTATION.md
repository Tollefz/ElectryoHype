# URL Storage Implementation - Per Provider

## Oversikt

"Last URLs" funksjonen er oppdatert til å lagre og hente URLs separat per provider (Temu/Alibaba) i localStorage.

## Implementasjon

### Storage Keys

- **Temu**: `bulk-import-urls-temu`
- **Alibaba**: `bulk-import-urls-alibaba`

### Funksjonalitet

1. **Automatisk lagring**
   - URLs lagres automatisk til localStorage når de endres (debounced 500ms)
   - Lagres separat per provider

2. **Automatisk lasting**
   - Når provider endres, lastes automatisk lagrede URLs for den provideren
   - Produkter cleares når provider endres

3. **"Last URLs" knapp**
   - Ny separat knapp som laster lagrede URLs fra localStorage
   - Viser alert hvis ingen lagrede URLs finnes

4. **"Parse URLs" knapp**
   - Eksisterende knapp (tidligere "Last URLs") som nå parser og validerer URLs
   - Lagrer normaliserte URLs til storage etter parsing

## Endringer

### `app/admin/(panel)/products/temu-import/TemuImportClient.tsx`

**Nye funksjoner:**
- `getStorageKey(provider)` - Genererer storage key per provider
- `loadUrlsFromStorage(provider)` - Henter URLs fra localStorage
- `saveUrlsToStorage(provider, urls)` - Lagrer URLs til localStorage
- `handleLoadUrls()` - Ny handler for "Last URLs" knapp

**Oppdaterte funksjoner:**
- `handleParse()` - Lagrer normaliserte URLs etter parsing
- Provider dropdown - Lagrer URLs før switching

**Nye useEffect hooks:**
- Load URLs når provider endres
- Save URLs når de endres (debounced)

**UI endringer:**
- Ny "Last URLs" knapp (grå)
- "Parse URLs" knapp (mørk, tidligere "Last URLs")

## Bruk

### Scenario 1: Første gang med Temu

1. Velg "Temu" i dropdown
2. Lim inn Temu URLs i textarea
3. Klikk "Parse URLs" for å validere
4. URLs lagres automatisk til `bulk-import-urls-temu`

### Scenario 2: Bytt til Alibaba

1. Velg "Alibaba" i dropdown
2. URLs for Alibaba lastes automatisk fra `bulk-import-urls-alibaba`
3. Hvis ingen lagrede URLs, vises tom textarea

### Scenario 3: Last lagrede URLs

1. Velg provider (Temu eller Alibaba)
2. Klikk "Last URLs" knapp
3. Lagrede URLs lastes inn i textarea
4. Hvis ingen lagrede URLs, vises alert

### Scenario 4: Fortsett der du slapp

1. Velg provider
2. URLs lastes automatisk fra forrige session
3. Fortsett med import

## Testing

### Manuell testing

1. **Test Temu lagring:**
   - Lim inn Temu URLs
   - Parse URLs
   - Sjekk localStorage: `localStorage.getItem('bulk-import-urls-temu')`

2. **Test Alibaba lagring:**
   - Bytt til Alibaba
   - Lim inn Alibaba URLs
   - Parse URLs
   - Sjekk localStorage: `localStorage.getItem('bulk-import-urls-alibaba')`

3. **Test separat lagring:**
   - Lagre Temu URLs
   - Lagre Alibaba URLs
   - Bytt mellom providers
   - Verifiser at riktige URLs vises

4. **Test "Last URLs" knapp:**
   - Tøm textarea
   - Klikk "Last URLs"
   - Verifiser at lagrede URLs lastes

### Test funksjoner

Se `app/admin/(panel)/products/temu-import/__tests__/url-storage.test.ts` for manuelle test funksjoner.

I browser console:
```javascript
// Test lagring
testUrlStorage.testSaveTemuUrls();
testUrlStorage.testSaveAlibabaUrls();

// Test henting
testUrlStorage.testLoadTemuUrls();
testUrlStorage.testLoadAlibabaUrls();

// Test separat lagring
testUrlStorage.testSeparateStorage();

// List all storage
testUrlStorage.testListStorage();
```

## Tekniske Detaljer

### Debouncing

URLs lagres automatisk 500ms etter at brukeren slutter å skrive. Dette unngår for mange localStorage operasjoner.

### Error Handling

- Try-catch rundt alle localStorage operasjoner
- Console warnings ved feil
- Graceful fallback (tom string hvis feil)

### Storage Limits

localStorage har typisk ~5-10MB limit. For URLs (typisk <1KB per URL), kan tusenvis av URLs lagres.

### Browser Support

localStorage støttes i alle moderne browsere. Fallback håndteres med `typeof window === 'undefined'` check.

## Eksempel

```typescript
// Automatisk lagring når URLs endres
useEffect(() => {
  if (!urls.trim()) return;
  
  const timeoutId = setTimeout(() => {
    saveUrlsToStorage(provider, urls);
  }, 500);

  return () => clearTimeout(timeoutId);
}, [urls, provider]);

// Automatisk lasting når provider endres
useEffect(() => {
  const storedUrls = loadUrlsFromStorage(provider);
  setUrls(storedUrls);
  setProducts([]);
}, [provider]);
```

## Breaking Changes

**Ingen** - Eksisterende funksjonalitet fungerer uendret, med tillegg av automatisk lagring/henting.

## Notater

- URLs lagres som plain text (én per linje)
- Normaliserte URLs lagres etter parsing
- Storage cleares ikke automatisk (persisterer mellom sessions)
- Manuell clearing: `localStorage.removeItem('bulk-import-urls-temu')`

