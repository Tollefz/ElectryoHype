/**
 * Function-first classification for buyer candidates (shared with catalog tree).
 * Prevents Marketing words (Gaming/RGB) from overriding product function.
 */

import { inferMainAndSub } from "@/lib/categories/tree";

export type BuyerTaxonomy = {
  main: string;
  subcategory: string | null;
  confidence: number;
  /** Shelf id used by DeskBuyer groups */
  shelfId: string;
  shelfLabel: string;
  fitsElectroHype: boolean;
  rejectReason?: string;
};

const MAIN_TO_SHELF: Record<string, { id: string; label: string }> = {
  Gaming: { id: "gaming", label: "Gaming" },
  "Mobil & Tilbehør": { id: "mobil", label: "Mobil & Tilbehør" },
  "Data & IT": { id: "kontor", label: "Data & IT" },
  "TV, Lyd & Bilde": { id: "audio", label: "TV, Lyd & Bilde" },
  "Hjem & Fritid": { id: "hjem", label: "Hjem & Fritid" },
  Hvitevarer: { id: "andre", label: "Hvitevarer" },
};

const OFF_ASSORTMENT =
  /\b(solar|solcelle|panel\s*sol|photovoltaic|clothing|klær|dress|shoes|sko|medicine|supplement|vitamin|adult|sex\s*toy|weapon|firearm)\b/i;

const TRUE_GAMING_PERIPHERAL =
  /\b(gaming\s*)?(mouse|mus|keyboard|tastatur|headset|mouse\s*pad|mousepad|musematte|desk\s*mat|desk\s*pad|gamepad|controller)\b/i;

/**
 * Classify a candidate title (+ optional hints) into store taxonomy.
 */
export function classifyBuyerCandidate(text: string): BuyerTaxonomy {
  const hay = (text || "").trim();
  if (OFF_ASSORTMENT.test(hay)) {
    return {
      main: "Hjem & Fritid",
      subcategory: null,
      confidence: 20,
      shelfId: "andre",
      shelfLabel: "Passer ikke",
      fitsElectroHype: false,
      rejectReason: "Passer ikke ElectroHype-sortimentet",
    };
  }

  // Plush / toy "mouse" is not a PC peripheral
  if (
    /\b(plush|doll|toy|cute\s*cartoon|stuffed)\b/i.test(hay) &&
    !TRUE_GAMING_PERIPHERAL.test(hay.replace(/\bmouse\b/gi, " "))
  ) {
    return {
      main: "Hjem & Fritid",
      subcategory: null,
      confidence: 25,
      shelfId: "andre",
      shelfLabel: "Passer ikke",
      fitsElectroHype: false,
      rejectReason: "Leketøy / pyntegjenstand — ikke elektronikksortiment",
    };
  }

  const inferred = inferMainAndSub(hay);
  const shelf = MAIN_TO_SHELF[inferred.main] || {
    id: "andre",
    label: inferred.main,
  };

  // Phone cases / chargers must not sit in Gaming even if title says "Gaming"
  const looksLikePhoneCase =
    /\b(phone\s*case|mobildeksel|iphone|samsung|galaxy|pixel)\b/i.test(hay) &&
    !TRUE_GAMING_PERIPHERAL.test(hay);
  if (looksLikePhoneCase && (inferred.main === "Gaming" || /gaming/i.test(hay))) {
    return {
      main: "Mobil & Tilbehør",
      subcategory: "Mobildeksel",
      confidence: 90,
      shelfId: "mobil",
      shelfLabel: "Mobil & Tilbehør",
      fitsElectroHype: true,
    };
  }

  const looksLikeGenericCharger =
    /\b(charger|lader|usb[- ]?c\s*(charger|lader)|wall\s*charger|vegglader)\b/i.test(
      hay
    ) &&
    !TRUE_GAMING_PERIPHERAL.test(hay) &&
    !/\b(controller|console|ps5|xbox|nintendo)\b/i.test(hay);
  if (
    looksLikeGenericCharger &&
    (inferred.main === "Gaming" || /gaming/i.test(hay))
  ) {
    return {
      main: "Mobil & Tilbehør",
      subcategory: "Ladere",
      confidence: 88,
      shelfId: "mobil",
      shelfLabel: "Mobil & Tilbehør",
      fitsElectroHype: true,
    };
  }

  return {
    main: inferred.main,
    subcategory: inferred.subcategory,
    confidence: inferred.confidence,
    shelfId: shelf.id,
    shelfLabel: shelf.label,
    fitsElectroHype: inferred.confidence >= 50,
  };
}

export function formatTaxonomyPath(t: BuyerTaxonomy): string {
  if (t.subcategory) return `${t.main} › ${t.subcategory}`;
  return t.main;
}
