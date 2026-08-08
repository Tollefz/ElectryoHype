/**
 * Store DNA Policy — single source of truth for assortment hard-blocks.
 *
 * Product Focus / observational Store DNA (`store-dna.ts`) describe intent/identity.
 * THIS file decides what must never enter the catalog (REJECTED, not publishable).
 *
 * Import only from here for absolute rejects — do not scatter new regex elsewhere.
 */

export type AssortmentPattern = { pattern: RegExp; label: string };

/**
 * Absolute reject — always REJECTED. Owner cannot override via importer / publish gate.
 * Includes classic store rules + explicit off-DNA categories found live in QA.
 */
export const STORE_DNA_ABSOLUTE_REJECTS: AssortmentPattern[] = [
  // Classic hard rules
  {
    pattern:
      /\b(klær|clothing|hoodie|hettegenser|t[- ]?shirt|tyskjorte|bukse|jeans|kjole|skirt|jakke|jacket|genser|sweater|sokker|socks|undertøy|underwear)\b/i,
    label: "Klær",
  },
  {
    pattern: /\b(adult|sex\b|erotisk|lingerie)\b/i,
    label: "Voksenprodukter",
  },
  {
    pattern: /\b(replica|1:1|aaa quality|kopi av|counterfeit|fake brand|knockoff)\b/i,
    label: "Falske/kopiprodukter",
  },
  {
    pattern: /\b(medisin|medicine|prescription|legemiddel)\b/i,
    label: "Medisin",
  },
  {
    pattern: /\b(supplement|kosttilskudd|protein powder|dietary supplement|vitamin[er]?)\b/i,
    label: "Kosttilskudd",
  },
  {
    pattern:
      /\b(barnevogn|barnesete|child safety|bilbarnestol|car seat|pacifier|smokk|baby monitor)\b/i,
    label: "Sikkerhetskritiske barneprodukter",
  },
  {
    pattern:
      /\b(disney|marvel|pokemon|pokémon|hello kitty|lego|nintendo|star wars|harry potter|barbie|nike|adidas|gucci|louis vuitton|chanel|rolex|supreme|iron\s*man|ironman|spiderman|spider[- ]man)\b/i,
    label: "Varemerke/opphavsrett",
  },

  // Off-DNA — must never become publishable (Launch Stabilization / Admin QA)
  {
    pattern:
      /\b(jump(?:er)?[- ]?starter|startbooster|battery\s*booster|car\s*jump|car\s*starter|starter\s*booster|jumper\s*box|bil(?:start)?booster|peak\s*\d+\s*a\b.*(?:battery|charger|booster))\b/i,
    label: "Startbooster / bilbatteri",
  },
  {
    pattern:
      /\b(piano|keyboard\s*instrument|digital\s*piano|midi\s*keyboard|elektronisk\s*piano|keyboard\s*piano)\b/i,
    label: "Musikkinstrument",
  },
  {
    pattern:
      /\b(pet\b|puppy|kitten|hund(e|a)?|katt(e|a)?|dyreutstyr|pet\s*(toy|bed|bowl|collar|leash|feeder)|dog\s*toy|cat\s*toy|for\s*(indoor\s*)?cats?\b|for\s*dogs?\b|litter\s*box|cat\s*carousel|interactive\s*cat)\b/i,
    label: "Kjæledyr",
  },
  {
    pattern:
      /\b(baby\b|infant|toddler|nyfødt|barneklær|baby\s*(bottle|clothes|toy|walker|crib)|barneleketøy)\b/i,
    label: "Baby / barn",
  },
  {
    pattern:
      /\b(kitchen\b|kjøkken(?:maskin|redskap)?|air\s*fryer|airfryer|blender\b|food\s*processor|toaster|microwave|rice\s*cooker|kjøkkenvifte)\b/i,
    label: "Kjøkken / hvitevarer utenfor sortiment",
  },
  {
    pattern:
      /\b(massage\b|massasje|massage\s*gun|massage\s*gun|fascia\s*gun|neck\s*massager|massasjepistol)\b/i,
    label: "Massasje",
  },
  {
    pattern:
      /\b(beauty\b|kosmetikk|cosmetics|makeup|lipstick|mascara|serum|ansiktskrem|skincare|skin\s*care|hair\s*care|hårpleie|neglelakk)\b/i,
    label: "Beauty / kosmetikk",
  },
  {
    pattern:
      /\b(oil\s*diffuser|aroma\s*diffuser|aromatherapy|duftdiffuser|essential\s*oil\s*diffuser|luftfukter\s*aroma)\b/i,
    label: "Oljediffuser / aroma",
  },
  {
    pattern: /\b(teleprompter|tele\s*prompter|prompter\b)\b/i,
    label: "Teleprompter",
  },
  {
    pattern:
      /\b(fidget\b|fidget\s*(spinner|toy|cube)|pop\s*it\b|stressball|anty[- ]?stress\s*leke)\b/i,
    label: "Fidget / leketøy",
  },
];

/**
 * Soft off-assortment — REVIEW only (owner may still import after confirmation).
 * Absolute rejects above take precedence.
 */
export const STORE_DNA_REVIEW_CATEGORIES: AssortmentPattern[] = [
  { pattern: /\b(sko|shoes|sneakers|støvler|boots|sandals)\b/i, label: "Sko" },
  {
    pattern:
      /\b(smykke|jewelry|jewellery|necklace|bracelet|ørering|earring|anheng|armbånd|wedding ring|forlovelsesring)\b/i,
    label: "Smykker",
  },
  { pattern: /\b(klokke|wristwatch|smartklokke|smartwatch)\b/i, label: "Klokker" },
  { pattern: /\b(godteri|candy|snack food|coffee beans)\b/i, label: "Mat" },
  { pattern: /\b(leketøy|toys?\b|dukke|doll|bamse|plush)\b/i, label: "Leker" },
  {
    pattern:
      /\b(julepynt|christmas ornament|halloween|påskeegg|party decoration|ballong|balloon)\b/i,
    label: "Sesongpynt",
  },
  {
    pattern: /\b(dekorasjon|decorative wall|poster frame only|vase\b|figurine)\b/i,
    label: "Dekor uten praktisk verdi",
  },
];

function matchFirstLabel(
  text: string,
  patterns: AssortmentPattern[]
): string | null {
  const hay = text.trim();
  if (!hay) return null;
  for (const entry of patterns) {
    if (entry.pattern.test(hay)) return entry.label;
  }
  return null;
}

/** Absolute Store DNA violation — always REJECTED. */
export function detectStoreDnaAbsoluteReject(text: string): string | null {
  return matchFirstLabel(text, STORE_DNA_ABSOLUTE_REJECTS);
}

/** Soft off-assortment — REVIEW. */
export function detectStoreDnaReviewCategory(text: string): string | null {
  return matchFirstLabel(text, STORE_DNA_REVIEW_CATEGORIES);
}

/** True when title/category must never be publishable. */
export function isStoreDnaBlocked(text: string): boolean {
  return detectStoreDnaAbsoluteReject(text) != null;
}
