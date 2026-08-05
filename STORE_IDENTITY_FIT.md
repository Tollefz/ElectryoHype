# Store Identity Fit

Generisk vurderingslag: **passer produktet butikkens identitet?**

Ikke «er det elektronikk?» — men:

> Ville en kunde forventet å finne dette hos *denne* butikken?

---

## Plassering i pipeline

```
Shop match / analyze
  → Store Identity Fit   ← NYTT (før Merch Score)
  → Assortment + Produktfokus
  → Merch Brain (Butikkscore)
  → (display) Memory / DNA / Feedback
  → Publish gate (Identity Fit obligatorisk)
```

**Ikke hard filter** i jakt — sterk demoting + forklaring.  
**Publish:** score under 25 blokkerer normalt, selv med god margin/levering. Unntak krever begrunnelse (`identityExceptionReason`).

---

## Motor (vertikal-agnostisk)

Identitet kommer fra **Store Profile / Store DNA**, ikke hardkodede merkeord:

| Signal | Kilde |
|--------|--------|
| Profilkategorier + strategi/publikum | `ShopProfile` |
| Unngå-kategorier | `ShopProfile.avoidCategories` |
| Produktfokus-stjerner | Product Focus |
| Katalogfamilie-andel | aktive produkter |
| Store DNA-trekk | `buyer_store_dna` |
| Living category focus | `StoreLivingProfile` |
| Memory publish/reject | AI Store Memory |

Flere signaler kombineres (token-overlap, familie, fokus, DNA, memory).  
**Ikke** `if title contains piano`.

Samme motor kan brukes for ElectroHype / BeautyHype / PlantHype / PetHype ved å bytte butikkprofil.

---

## Score-bånd

| Score | Band | Effekt |
|------:|------|--------|
| ≥ 85 | strong | Styrker profil |
| ≥ 70 | good | OK |
| ≥ 45 | weak | Demotes ranking (−14), forklaring |
| < 25 | reject | Sterk demote + normalt ikke publiser |

Lav score får alltid `why` på norsk, f.eks.:

- «Dette produktet passer dårlig med ElectroHypes profil.»
- «Produktet tilhører en kategori vi normalt ikke selger.»
- «AI vurderer at kunder ikke forventer å finne dette hos …»

---

## Filer

```
lib/identity/
  types.ts
  tokens.ts
  store-identity-fit.ts      # scoreStoreIdentityFit (pure)
  store-identity-context.ts  # getStoreIdentityContext
  identity-mission.ts        # Mission Control snapshot
  index.ts
```

Kobling:

- `hunt-store-builder.ts` — Identity før Merch Score
- `scan.ts` — persisterer `scores.identityFit`
- `auto-publish-gate.ts` — `AUTO_PUBLISH_MIN_IDENTITY_FIT`
- `approve-and-publish.ts` — sender fit inn i gate
- Mission Control: seksjon **Store Identity**

---

## Mission Control

Viser:

- Produkter med lav identitetsscore
- Vanligste årsaker
- Kategorier AI avviser
- Produkter som styrker profilen

---

## Relatert

- `STORE_DNA.md` — observert katalogidentitet  
- `ROB_CEO.md` / `AI_MANAGEMENT_TEAM.md` — ledelseslag  
- `SCORE_TRUTH.md` — score-kanon
