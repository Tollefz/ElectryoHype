/**
 * Client-safe labels for dislike reasons (no server-only imports).
 */

export type DislikeReason =
  | "feil_kategori"
  | "darlig_margin"
  | "for_dyr"
  | "lang_levering"
  | "darlig_produkt"
  | "ser_billig_ut"
  | "passer_ikke"
  | "annet";

export const DISLIKE_REASON_LABELS: Record<DislikeReason, string> = {
  feil_kategori: "Feil kategori",
  darlig_margin: "Dårlig margin",
  for_dyr: "For dyr",
  lang_levering: "Lang levering",
  darlig_produkt: "Dårlig produkt",
  ser_billig_ut: "Ser billig ut",
  passer_ikke: "Passer ikke ElectroHype",
  annet: "Annet",
};
