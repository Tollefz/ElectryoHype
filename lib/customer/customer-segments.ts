/**
 * Customer CRM personas — understand who the customer is.
 * Not marketing creatives. Labels for Desk / Mission Control.
 */

export type CustomerSegmentId =
  | "gaming"
  | "mobil"
  | "apple"
  | "smart_home"
  | "kontor"
  | "premium"
  | "prisbevisst";

/** Short category labels (recommendations) */
export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegmentId, string> = {
  gaming: "Gaming",
  mobil: "Mobil",
  apple: "Apple",
  smart_home: "Smart Home",
  kontor: "Kontor",
  premium: "Premium",
  prisbevisst: "Prisbevisst",
};

/** CRM persona names — «who is this customer» */
export const CUSTOMER_PERSONA_LABELS: Record<CustomerSegmentId, string> = {
  gaming: "Gaming-entusiast",
  mobil: "Mobil",
  apple: "Apple-bruker",
  smart_home: "Smart Home",
  kontor: "Kontor",
  premium: "Premium-kunde",
  prisbevisst: "Prisjeger",
};

const RULES: Array<{
  id: CustomerSegmentId;
  test: (blob: string, avgPrice: number) => boolean;
}> = [
  {
    id: "gaming",
    test: (b) => /gaming|gamer|spill|rgb|headset|keyboard|musematte|gpu/i.test(b),
  },
  {
    id: "mobil",
    test: (b) =>
      /mobil|phone|iphone|magsafe|powerbank|lade|usb-c|deksel|holder/i.test(b),
  },
  {
    id: "apple",
    test: (b) => /apple|iphone|ipad|airpods|magsafe|lightning|watch/i.test(b),
  },
  {
    id: "smart_home",
    test: (b) =>
      /smart.?home|zigbee|homekit|alexa|plug|lampe|sensor|termostat/i.test(b),
  },
  {
    id: "kontor",
    test: (b) =>
      /kontor|office|desk|ergonom|dock|monitor|webcam|tastatur|mus\b/i.test(b),
  },
  {
    id: "premium",
    test: (b, avg) => avg >= 799 || /premium|pro\b|ultra|flagship/i.test(b),
  },
  {
    id: "prisbevisst",
    test: (_b, avg) => avg > 0 && avg < 249,
  },
];

export function detectCustomerSegments(input: {
  titles: string[];
  categories: Array<string | null | undefined>;
  avgOrderValue: number;
}): Array<{ id: CustomerSegmentId; label: string; persona: string; hits: number }> {
  const blob = [...input.titles, ...input.categories.filter(Boolean)]
    .join(" ")
    .toLowerCase();
  const counts = new Map<CustomerSegmentId, number>();

  for (const rule of RULES) {
    if (rule.test(blob, input.avgOrderValue)) {
      counts.set(rule.id, (counts.get(rule.id) || 0) + 1);
    }
  }

  for (const title of input.titles) {
    const t = title.toLowerCase();
    for (const rule of RULES) {
      if (rule.id === "premium" || rule.id === "prisbevisst") continue;
      if (rule.test(t, input.avgOrderValue)) {
        counts.set(rule.id, (counts.get(rule.id) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([id, hits]) => ({
      id,
      label: CUSTOMER_SEGMENT_LABELS[id],
      persona: CUSTOMER_PERSONA_LABELS[id],
      hits,
    }))
    .sort((a, b) => b.hits - a.hits);
}

/**
 * Recommend categories this customer fits — not ads.
 * Example: «Denne kunden passer best med: Gaming · ikke Mobil»
 */
export function recommendSegmentsForCustomer(
  segments: Array<{ id: CustomerSegmentId; label: string; hits: number }>
): { shouldGet: string[]; avoid: string[]; why: string; headline: string } {
  if (segments.length === 0) {
    return {
      shouldGet: [],
      avoid: [],
      why: "Ikke nok kjøpssignal til å anbefale kategori ennå.",
      headline: "For lite historikk til profil ennå.",
    };
  }
  const top = segments[0];
  const shouldGet = segments.slice(0, 2).map((s) => s.label);

  const avoid: string[] = [];
  const ids = new Set(segments.map((s) => s.id));
  if (top.id === "gaming" && !ids.has("mobil")) avoid.push("Mobil");
  if (top.id === "mobil" && !ids.has("gaming") && top.hits >= 2) {
    avoid.push("Gaming");
  }
  if (top.id === "prisbevisst") avoid.push("Premium");
  if (top.id === "kontor" && !ids.has("gaming")) avoid.push("Gaming");
  if (top.id === "apple" && !ids.has("smart_home")) {
    /* apple-first — soft avoid unrelated diy if weak */
  }

  for (const s of segments.slice(2)) {
    if (s.hits === 1 && s.id !== top.id && avoid.length < 2) {
      avoid.push(s.label);
    }
  }

  const avoidUnique = [...new Set(avoid)].filter((a) => !shouldGet.includes(a));
  const why = `Sterkest signal: ${top.label} (${top.hits} treff i kjøpshistorikk).`;
  const headline =
    avoidUnique.length > 0
      ? `Denne kunden passer best med: ${shouldGet[0]} · ikke ${avoidUnique[0]}`
      : `Denne kunden passer best med: ${shouldGet.join(", ")}`;

  return {
    shouldGet: [...new Set(shouldGet)],
    avoid: avoidUnique,
    why,
    headline,
  };
}
