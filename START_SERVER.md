# Hvordan starte ElektroHype serveren

## Kommandoer i PowerShell

### 1. Naviger til prosjektet:
```powershell
cd "C:\Users\robto\OneDrive\Skrivebord\Dropshipping\dropshipping-upgrade"
```

### 2. Installer avhengigheter (hvis node_modules mangler):
```powershell
npm install
```

### 3. Start utviklingsserveren:
```powershell
npm run dev
```

### 4. Åpne nettleseren:
Serveren starter på: **http://localhost:3000**

---

## Alternative kommandoer:

### Start produksjonsserver (etter build):
```powershell
npm run build
npm start
```

### Sjekk diskplass:
```powershell
powershell -ExecutionPolicy Bypass -File "scripts\check-disk-usage.ps1"
```

### Rydd opp diskplass:
```powershell
powershell -ExecutionPolicy Bypass -File "scripts\cleanup-disk.ps1"
```

---

## Rask start (alle kommandoer på en gang):
```powershell
cd "C:\Users\robto\OneDrive\Skrivebord\Dropshipping\dropshipping-upgrade" ; npm run dev
```

