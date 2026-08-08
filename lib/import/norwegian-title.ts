/**
 * Heuristic: title still looks like English supplier copy (not Norwegian store name).
 * Used to flag «Norsk navn» fields that were never translated.
 */

const NORWEGIAN_MARKERS =
  /\b(og|uten|fra|eller|ikke|denne|dette|skjerm|lader|kabel|tastatur|mus|deksel|holder|belysning|oppladbar|trådløs|støtte|pakke|hurtiglader|ørepropper|høyttaler|dokking|musematte)\b/i;

const ENGLISH_MARKERS =
  /\b(the|and|with|from|wireless|portable|compatible|charger|cable|keyboard|mouse|case|holder|lighting|rechargeable|package|includes|features|charging|apple|samsung)\b/i;

export function looksLikeEnglishTitle(title: string | null | undefined): boolean {
  const t = (title || "").trim();
  if (t.length < 8) return false;
  const hasEn = ENGLISH_MARKERS.test(t);
  const hasNo = NORWEGIAN_MARKERS.test(t);
  // Strong English signal wins over weak bilingual glue words
  if (hasEn && !hasNo) return true;
  if (hasNo && !hasEn) return false;
  if (hasEn && hasNo) {
    // Hybrid retail titles (e.g. «Sammenleggbart Bluetooth-tastatur») are OK
    if (
      /\b(tastatur|trådløs|sammenlegg|musematte|hurtiglader|ørepropper|høyttaler|dokking|skjermfeste|gaming-mus|gaming-tastatur|powerbank|ringlys|kondensator)\b/i.test(
        t
      )
    ) {
      return false;
    }
    return true;
  }
  // Mostly ASCII Latin without Norwegian letters — only flag clear English content words
  const hasNoLetters = !/[æøåäöü]/i.test(t);
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (hasNoLetters && wordCount >= 3) {
    return /\b(the|and|with|from|wireless|charger|keyboard|mouse|compatible|portable|rechargeable|package|includes|features|apple|samsung|thumb|wheel|ergonomic|silicone|corner|computer|desk|shelves|outdoor|digital|display|supply|controller|wired|studio|monitor|stands|charge|mobile\s*power|lavalier|unlocked|smartphone)\b/i.test(
      t
    );
  }
  return false;
}
