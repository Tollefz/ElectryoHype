# AI Management Team

ElectroHypeX **AI Council** — samarbeidslaget mellom eksisterende AI-er.

**Ingen nye AI-er.** Buyer, Marketing, Orders, Finance, SEO og Customer finnes allerede. Dette laget får dem til å snakke sammen — via Rob.

---

## Formål

| Rolle | Ansvar |
|-------|--------|
| **Hver AI** | Sender egne fakta-innsikter til Council |
| **Rob CEO** | Prioriterer, skriver morgenbrev, foreslår via Approval Gate |
| **Mission Control** | Viser én samlet teamstatus |
| **Mennesket** | Bestemmer alltid |

---

## Hvordan AI-ene kommuniserer

```
Buyer ──┐
Marketing ──┤
Orders ──┼──► AI Council (convene) ──► Rob CEO (prioriter) ──► Approval Gate
Finance ──┤                              │
SEO ──┤                              └──► Mission Control (én status)
Customer ──┘
```

1. **`registerCouncilMember`** — hvert medlem registreres med `collect()`
2. **`conveneCouncil()`** — `Promise.allSettled` over alle medlemmer (én feil stopper ikke de andre)
3. Hvert medlem returnerer en **`CouncilMemberReport`**: health, summary, `CouncilInsight[]`
4. Rob mapper innsikter → morgenbrev + gate-forslag
5. Mission Control bygger **én** `AiManagementMissionStatus` fra samme session

Kommunikasjon er **pull**, ikke chat: Rob / Mission Control ber om fakta. Medlemmene pusher ikke sideeffekter.

API (én convene):

- `GET /api/admin/council` → `{ mission, ceo }`
- `GET /api/admin/ceo` → samme session-bygde brief (+ mission)
- `POST /api/admin/ceo` `{ action: "ignore" }` → kun notering, **ingen** butikkhandling

---

## Hvilke data de deler

Felles konvolutt: **`CouncilInsight`**

| Felt | Betydning |
|------|-----------|
| `memberId` | Hvilken AI (`buyer`, `marketing`, …) |
| `sourceAi` | Visningsnavn («Buyer Brain») |
| `headline` | Kort prioritet på norsk |
| `why` | Hvorfor dette betyr noe |
| `data` | Konkrete tall / id-er / statuser |
| `confidence` | 0–100 (fra kilde-severity/tone) |
| `priority` | `critical` \| `high` \| `medium` \| `low` |
| `kind` | `observation` \| `proposal` |
| `requiresApproval` | Type menneskelig port (se under) |
| `href` / `productId` / `orderId` | Valgfri navigasjon |

### Hva hvert medlem typisk deler

| Medlem | Datakilder (fakta) | Eksempel-innsikt |
|--------|--------------------|------------------|
| **Buyer** | Desk-status, ImportQueue `review`/`approved` | «3 produkter klare for publisering» |
| **Marketing** | Desk-status, promote/pause, anbefalinger | «Bør annonseres: …» |
| **Orders** | Forsinket / høyrisiko / attention | «5 ordre trenger oppfølging» |
| **Finance** | Loss makers, anbefalinger | «Disse taper penger» |
| **SEO** | SEO-score, worst pages, warnings | «SEO-problem: score 48/100» |
| **Customer** | Churn, VIP, kategori-forslag | «4 kunder med churn-risiko» |

**Regel:** Ingen AI finner på tall. Hvis `collect()` feiler, rapporteres `health: error` — Rob skriver ikke en erstatningshistorie.

---

## Beslutninger som krever menneskelig godkjenning

Alle **forslag** (`kind: "proposal"`) går via Approval Gate. Rob og Council **utfører aldri**.

| `requiresApproval` | Eksempel | Mennesket må |
|--------------------|----------|--------------|
| `publish_product` | Godkjent i importkø | Publisere / avvise |
| `import_product` | Review / kandidater | Importere / forkaste |
| `spend_ads` | Promote / pause-anbefaling | Sette budsjett / kjøre ads |
| `change_price` | Finance anbefaler margin | Endre pris manuelt |
| `refund_or_cancel` | Forsinket / høyrisiko-ordre | Refusjon / kontakt / stopp |
| `send_email` | Churn / VIP-forslag | Sende e-post selv |
| `generate_seo_content` | Meta / FAQ-mangler | Skrive / godkjenne innhold |
| `other_store_change` | Øvrige butikkendringer | Eksplisitt handling |

**Approval Gate-knapper (anbefaling only):**

- ✔ **Publiser / Følg opp / Annonser** — lenke til riktig sted (utfører ikke)
- ✔ **Ignorer** — noterer forslag
- ✔ **Vis detaljer** — utvider data + scroller til AI-widget

---

## Arkitektur

```
lib/council/
  types.ts           # CouncilInsight, session, mission status
  registry.ts        # registerCouncilMember / listCouncilMembers
  members.ts         # innebygde adaptere (Buyer…Customer)
  convene.ts         # Promise.allSettled
  mission-status.ts  # én Mission Control-status
  index.ts

lib/ceo/             # Rob — prioritering + brief + gate (leser Council)
components/admin/
  DeskRobCeo.tsx     # morgenbrev + gate
  DeskAiCouncil.tsx  # Mission Control-stripe
app/api/admin/
  council/route.ts
  ceo/route.ts
```

Desk: Rob CEO (inkl. Mission Control) øverst på `/admin/dashboard`.  
Ingen ny admin-meny.

---

## Hvordan nye AI-moduler kobles inn

**Uten å endre Rob, Mission Control eller eksisterende medlemmer:**

```ts
// f.eks. lib/inventory/council-member.ts
import { registerCouncilMember } from "@/lib/council";

registerCouncilMember({
  memberId: "inventory",
  label: "Inventory",
  sourceAi: "Inventory Brain",
  deskHref: "#desk-inventory",
  collect: async () => {
    // Kun egne fakta — ingen inventering, ingen sideeffekter
    return {
      health: "ready",
      summary: "…",
      insights: [
        {
          id: "inv-1",
          memberId: "inventory",
          sourceAi: "Inventory Brain",
          priority: "high",
          headline: "…",
          why: "…",
          data: "…",
          confidence: 80,
          kind: "proposal",
          requiresApproval: "other_store_change",
          href: "#desk-inventory",
        },
      ],
    };
  },
});
```

Deretter importeres filen én gang (f.eks. fra `lib/council/members.ts` eller egen bootstrap).

**Hva skjer automatisk:**

1. `conveneCouncil()` inkluderer det nye medlemmet
2. Mission Control viser ny flis + health
3. Rob får ny seksjon i morgenbrevet
4. Prioriteringer / Approval Gate inkluderer forslag med `critical`/`high`

**Hva du ikke trenger å endre:**

- `DeskRobCeo` / `DeskAiCouncil` UI-kjerne
- `buildCeoMorningBrief` (dynamiske `members[]`)
- `buildMissionStatusFromSession`
- Eksisterende Buyer/Marketing/…-hjerner

**Kontrakt for nye moduler:**

1. Kun fakta fra egen datakilde  
2. Fyll `why`, `data`, `confidence`, `sourceAi`  
3. Sett `requiresApproval` på alt som er handling  
4. Ingen auto-publish / spend / refund / pris / e-post / SEO-skriving  

---

## Relatert

- `ROB_CEO.md` — Rob som administrerende direktør  
- `ORDER_BRAIN.md`, `FINANCE_BRAIN.md`, `CUSTOMER_BRAIN.md`, `SEO_BRAIN.md`, `MARKETING_ENGINE.md` — domenene  
- Buyer Mission Control (`AiMissionControl`) — fortsatt Product Hunt-observasjon; **AI Council Mission Control** er teamstatus på Rob’s Desk
