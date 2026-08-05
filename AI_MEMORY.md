# AI Store Memory

Butikkens langtidshukommelse for produktjakt — **ikke** chat-memory.

AI lærer av tidligere jakter (publisert, avvist, likt, slettet, margin, levering, leverandør) og bruker det som et **lite**, forklarbart score-lag.

## Prinsipper

1. **Ekstra lag** — Discovery Scheduler, Merch Brain, Worker og rangering er uendret.
2. **Kan aldri redde et dårlig produkt** — nudge er hard-capped til **±3** poeng på Butikkscore.
3. **Alltid forklarbart** — hver nudge har `why[]` (f.eks. «AI har tidligere hatt gode erfaringer med denne leverandøren»).
4. **Aggregert fra fakta** — bygges fra kandidater, produkter og admin-feedback, ikke fra fri tekst.

## Hva huskes

| Signal | Kilde |
|---|---|
| Publisert | Aktive produkter med leverandørkobling |
| Avvist | `BuyerCandidate` status `rejected` / `dismissed` |
| Admin likte / mislikte | `AiFeedbackEvent` + thumbs |
| Slettet / arkivert | Produkter `isActive=false` / archived-tag |
| Høy / dårlig margin | Candidate pricing + produktpris |
| Prisfeil | Economic flags (`fx_stale`, `sale_below_landed`, …) |
| Dårlig levering | Snapshot delivery ≥ ~12 dager |
| Leverandør-erfaring | Aggregering per `supplier` |

Mønstre nøkles på `family:…`, `supplier:…` og `fp:…` (fingerprint).

## API

`lib/buyer/ai-memory.ts`

| Funksjon | Rolle |
|---|---|
| `rebuildAiMemory()` | Leser DB → skriver Setting `buyer_ai_memory` |
| `getAiMemory()` | Cache (30 min) eller rebuild |
| `scoreAiMemory(memory, candidate)` | `{ nudge, memoryScore, why }` |
| `applyAiMemoryNudge(butikkscore, nudge)` | Capped ±3 |

Konstanter: `MEMORY_NUDGE_MAX = 3`, `AI_MEMORY_SETTING_KEY = "buyer_ai_memory"`.

## Hvordan score brukes

```
Merch Brain butikkscore  →  + AI Memory nudge (±3)  →  vist Butikkscore
```

- Kalles **etter** `computeMerchBrain` i `toBuyerCard` (når `aiMemory` er gitt).
- Visning i Mission Control Merch-topp.
- **Ikke** inne i Discovery / `rankAsStoreBuilder` / Worker.

Eksempel forklaringer:

- ✔ AI har tidligere hatt gode erfaringer med denne leverandøren  
- ⚠ Admin avviser ofte lignende produkter  

## Mission Control

Seksjon **AI Memory** viser:

- AI Memory Score  
- Publiserte / Avviste  
- Lært siste 30 dager  
- Top positive / negative patterns  

## Oppdatering

- Automatisk rebuild når cache er eldre enn 30 minutter  
- Etter admin thumbs (`recordBuyerThumb`) — async rebuild  

## Relatert

Eksisterende `lib/autonomy/memory.ts` (`StoreMemory` likes/dislikes) brukes fortsatt til preferanse/shop-match. Dette laget er **jakt-erfaring** på tvers av publiseringer og avvisninger — komplementært, ikke en erstatning.
