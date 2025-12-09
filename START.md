# 🚀 Starte opp ElektroHype nettsiden

## For å starte utviklingsserveren:

1. **Åpne PowerShell** (høyreklikk på mappen og velg "Open in Terminal" eller åpne PowerShell og naviger til mappen)

2. **Naviger til prosjektmappen:**
```powershell
cd "C:\Users\robto\OneDrive\Skrivebord\Dropshipping\dropshipping-upgrade"
```

3. **Start utviklingsserveren:**
```powershell
npm run dev
```

4. **Åpne nettleseren:**
- Gå til: http://localhost:3000

## Alternative kommandoer:

### Bygge prosjektet (test at alt kompilerer):
```powershell
npm run build
```

### Kjøre produksjonsserver (etter build):
```powershell
npm start
```

### Oppdatere alle produkter med varianter:
```powershell
npm run update:all-variants
```

## Feilsøking:

Hvis du får feil om manglende moduler:
```powershell
npm install
```

Hvis du får feil om database:
```powershell
npx prisma generate
npx prisma db push
```
