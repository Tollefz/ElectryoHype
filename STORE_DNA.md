# Store DNA

Observed store identity — **what the catalog has become**.

| Concept | Meaning |
|---|---|
| **Produktfokus** | Hva vi *ønsker* (eier-styrte stjerner) |
| **Store DNA** | Hva butikken *faktisk er* (fra publiserte produkter) |

Ingen LLM. Kun heuristikk på aktive produkter: tittel, kategori, familie, pris, tags.

## Traits

| Id | Label |
|---|---|
| `gaming` | Gaming |
| `premium` | Premium |
| `high_end` | High-end |
| `budget` | Lavpris |
| `kontor` | Kontor |
| `mobil` | Mobil |
| `apple` | Apple-kompatibelt |
| `nordic` | Nordiske merker |
| `minimalist` | Minimalistisk |
| `smart_home` | Smart Home |
| `rgb` | RGB |
| `streaming` | Streaming |
| `diy` | DIY |
| `maker` | Maker |

Hver trait får **0–100 %** = andel aktive produkter som matcher.

Eksempel:

```
Gaming.............87%
Premium............76%
Kontor.............41%
Mobil..............22%
Maker..............14%
Lavpris.............3%
```

## API

`lib/buyer/store-dna.ts`

| Funksjon | Rolle |
|---|---|
| `rebuildStoreDna()` | Leser aktiv katalog → Setting `buyer_store_dna` |
| `getStoreDna()` | Cache (30 min) eller rebuild |
| `scoreStoreDna(dna, candidate)` | `{ nudge, dnaScore, why }` |
| `applyStoreDnaNudge(score, nudge)` | Capped ±2 |

`DNA_NUDGE_MAX = 2` — lite signal, aldri dominant.

## Score-bruk

```
Merch Brain → + AI Memory (±3) → + Store DNA (±2) → vist Butikkscore
```

Discovery, Merch Brain-kjerne, Worker og rangering er uendret.

## Oppdatering

Automatisk ved:

- `publishImportQueueItem` (publisering)
- `bulkSetProductActive` (aktiver/arkiver)

## Historikk

Snapshot lagrer `history[]` (opptil 12 punkter). Mission Control viser:

- trait-bars (profil)
- endring siste uke / måned (pp)
- produkter som **styrker** identiteten
- produkter som **svekker** identiteten

## Mission Control

Seksjon **Store DNA** under AI Mission Control (`/admin/buyer`).

## Relatert

- `AI_MEMORY.md` — jakt-erfaring (publisert/avvist/liked)
- Produktfokus — ønsket hunt-prioritet
- Sortimentstrategi — dekningsmål
