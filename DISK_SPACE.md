# Diskplass Guide

## Nåværende bruk: ~2.7 GB

### Oppdeling:
- **dropshipping-upgrade** (aktivt prosjekt): **1.33 GB**
  - node_modules: 1.1 GB
  - .next: 235 MB
  
- **dropshipping-v2** (gammelt prosjekt): **1.42 GB**
  - node_modules: 1.3 GB
  - .next: 105 MB

- **Andre prosjekter**: ~2 MB

---

## Hvordan spare plass:

### 1. Slett .next mapper (anbefalt ✅)
`.next` mapper bygges automatisk når du kjører `npm run dev` eller `npm run build`.

**Sparer: ~340 MB**

```powershell
# Slett alle .next mapper
Remove-Item -Recurse -Force "dropshipping-upgrade\.next"
Remove-Item -Recurse -Force "dropshipping-v2\.next"
Remove-Item -Recurse -Force "dropshipping-v1\.next"
```

### 2. Slett gamle prosjekter (anbefalt ✅)
Hvis du bare bruker `dropshipping-upgrade`, kan du slette:
- `dropshipping-v1` (~1 MB)
- `dropshipping-v2` (**~1.4 GB**)
- `backup dropshipping-v1` (~1 MB)
- `dropshipping-new` (~0 MB)

**Sparer: ~1.4 GB**

### 3. Slett node_modules i gamle prosjekter (anbefalt ✅)
Du kan slette `node_modules` i prosjekter du ikke bruker. De kan alltid gjenopprettes med `npm install`.

**Sparer: ~1.3 GB** (fra dropshipping-v2)

```powershell
# Slett node_modules i dropshipping-v2
Remove-Item -Recurse -Force "dropshipping-v2\node_modules"
```

### 4. Bruk cleanup script
Kjør cleanup scriptet:

```powershell
cd dropshipping-upgrade
powershell -ExecutionPolicy Bypass -File "scripts\cleanup-disk.ps1"
```

---

## Anbefalt rydding:

1. ✅ Slett hele `dropshipping-v2` (hvis du ikke bruker det)
2. ✅ Slett `.next` mapper (bygges på nytt automatisk)
3. ✅ Behold bare `dropshipping-upgrade` som aktivt prosjekt

**Total besparelse: ~1.7 GB** (fra ~2.7 GB til ~1 GB)

---

## Minimum størrelse for dropshipping-upgrade:

- **Med node_modules**: ~1.1 GB
- **Uten node_modules**: ~50-100 MB
- **Med .next**: +200-300 MB

**Tips**: Du kan alltid gjenopprette `node_modules` med `npm install` hvis du trenger mer plass.

