# 🎨 Logo-forslag for ElektroHype

## Hva er en SVG-logo?

**SVG** (Scalable Vector Graphics) er et vektorbasert bildeformat som er perfekt for logoer:

### ✅ Fordeler med SVG:
- **Skalerbarhet**: Ser skarpt ut på alle størrelser (fra telefon til reklametavle)
- **Liten filstørrelse**: Mindre enn PNG/JPG logoer
- **Kan farges med CSS**: Enkelt å endre farger
- **Kan animeres**: Smooth animasjoner med CSS/JavaScript
- **Tilgjengelighet**: Tekst kan leses av skjermlesere

### ❌ Ulemper:
- Kan ikke bruke fotografier (bare vektorer/former)
- Eldre nettlesere trenger støtte (men Next.js håndterer dette)

---

## 🎯 6 Logo-forslag implementert

Alle logoforslag er implementert i `/components/Logo.tsx`. Du kan teste dem alle!

### Logo 1: Minimalistisk "E" med Lyn ⭐ (Anbefalt)
```
┌──────┐
│  E   │⚡
└──────┘
ElektroHype
```
**Beskrivelse**: Enkel, clean og profesjonell. Grønn boks med hvit E og lite lyn-ikon.

**Styrker**: 
- ✅ Lett å gjenkjenne
- ✅ Fungerer godt i liten størrelse (favicon)
- ✅ Moderne og minimalistisk

---

### Logo 2: "E" i Sirkel med Lyn
```
    ╭──────╮
   ╱   ⚡   ╲
  │    E    │
   ╲       ╱
    ╰──────╯
ElektroHype
```
**Beskrivelse**: E inni en sirkel med lyn-ikon. Hvit sirkel med grønn border.

**Styrker**:
- ✅ Mer tradisjonell logo-stil
- ✅ Fungerer godt som app-ikon

---

### Logo 3: Split-tekst med Lyn (Moderne)
```
ELEKTRO ⚡ HYPE
```
**Beskrivelse**: "ELEKTRO" i svart, lyn-ikon i grønt, "HYPE" i grønt.

**Styrker**:
- ✅ Veldig moderne og stilren
- ✅ Fokus på navnet
- ✅ Perfekt for desktop

---

### Logo 4: Gradient E med Lyn
```
┌─────┐⚡
│  E  │
└─────┘
ElektroHype
```
**Beskrivelse**: Gradient bakgrunn på E-boksen. Lyn til høyre.

**Styrker**:
- ✅ Moderne gradient-effekt
- ✅ Eye-catching

---

### Logo 5: Monogram med Lyn
```
┌──┐
│E⚡│
└──┘
ELEKTROHYPE
```
**Beskrivelse**: E med lyn inni boksen. Mer elegant.

**Styrker**:
- ✅ Elegant og sofistikert
- ✅ Perfekt for premium-merkevare

---

### Logo 6: Full Logo med Tagline (Profesjonell)
```
┌────────┐
│   E    │
│   ⚡   │
└────────┘
ELEKTRO
HYPE
Elektronikk & Tech
```
**Beskrivelse**: Stort ikon med tagline under. Perfekt for header.

**Styrker**:
- ✅ Mest profesjonelle
- ✅ Inkluderer tagline
- ✅ Perfekt for hjemmeside

---

## 🎨 Fargeforklaring

Alle logoer bruker ElektroHype fargepalett:
- **Grønn**: `#00C853` (Primær)
- **Mørk grønn**: `#00A844` (Hover/shadow)
- **Svart**: `#000000` (Tekst)
- **Hvit**: `#FFFFFF` (Bakgrunn/ikoner)

---

## 🔄 Hvordan teste logoene

1. **Åpne** `components/Header.tsx`
2. **Finn** logo-seksjonen (ca. linje 35-45)
3. **Erstatt** med ønsket logo:

```typescript
// Eksempel: Bruk Logo 2
import { LogoV2 } from '@/components/Logo';

// I Header:
<Link href="/" className="flex-shrink-0">
  <LogoV2 />
</Link>
```

---

## 📱 Responsivitet

Alle logoene er designet for å:
- ✅ Se bra ut på mobil
- ✅ Skalere ned til favicon-størrelse
- ✅ Fungere på både lys og mørk bakgrunn

---

## 💡 Anbefaling

**Jeg anbefaler Logo 1 eller Logo 6:**
- **Logo 1**: Perfekt for minimalistisk design (som Komplett.no)
- **Logo 6**: Perfekt for mer profesjonell/bedriftsmessig stil

Vil du at jeg skal oppdatere Header.tsx med en av disse logoene?

