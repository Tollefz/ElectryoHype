/**
 * Sanitize product descriptions imported from suppliers
 * Removes supplier references, tracking links, and marketing filler
 */

/**
 * Remove supplier references and marketing filler from description
 */
export function sanitizeDescription(description: string): string {
  if (!description || typeof description !== 'string') {
    return '';
  }

  let sanitized = description;

  // Remove supplier references (case-insensitive)
  const supplierPatterns = [
    /\b(på|fra|hos|via|kjøp på|kjøp fra|oppdag på|oppdag flere|discover|shop on|buy on)\s+(temu|alibaba|ebay)\b/gi,
    /\b(temu|alibaba|ebay)\s+(norway|norge|produkt|produkter|tilbud|priser?)\b/gi,
    /\b(oppdag|discover|explore)\s+(flere|more)\s+(gode|good|great)\s+(priser?|prices?|tilbud|deals?)\b/gi,
    /\b(shop|kjøp|buy)\s+(now|nå)\s+(on|på)\s+(temu|alibaba|ebay)\b/gi,
    /\b(visit|besøk|gå til)\s+(temu|alibaba|ebay)\b/gi,
    /\b(temu|alibaba|ebay)\s+(app|applikasjon|mobile|mobil)\b/gi,
  ];

  supplierPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Remove tracking/marketing URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+(temu|alibaba|ebay)[^\s]*/gi, '');
  sanitized = sanitized.replace(/\[.*?\]\(https?:\/\/[^\)]+\)/g, ''); // Markdown links

  // Remove common marketing filler phrases
  const fillerPatterns = [
    /\b(click here|klikk her|les mer|read more|se mer|view more)\s*(for|for å|to)?\s*(more|mer|flere)?\s*(details?|detaljer|information|informasjon|info)?\b/gi,
    /\b(limited time|begrenset tid|kun nå|only now|act now|handl nå)\b/gi,
    /\b(while supplies last|så lenge lageret varer|først til mølla)\b/gi,
    /\b(terms and conditions|vilkår og betingelser|se vilkår)\s*(apply|gjelder)?\b/gi,
    /\b(price|pris)\s*(may|kan)\s*(vary|variere)\b/gi,
    /\b(subject to change|kan endres|endringer forbeholdt)\b/gi,
  ];

  fillerPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Remove excessive whitespace and normalize line breaks
  sanitized = sanitized
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple line breaks to double
    .trim();

  // Remove lines that are just supplier names or marketing
  const lines = sanitized.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    
    // Remove lines that are just supplier references
    if (/^(temu|alibaba|ebay)$/i.test(trimmed)) return false;
    if (/^(på|fra|hos)\s+(temu|alibaba|ebay)$/i.test(trimmed)) return false;
    
    // Remove very short lines that are likely marketing
    if (trimmed.length < 10 && /^(click|klikk|se|les|buy|kjøp)/i.test(trimmed)) return false;
    
    return true;
  });

  sanitized = cleanedLines.join('\n').trim();

  // If description is too short or empty after sanitization, return empty
  // (caller should provide fallback)
  if (sanitized.length < 20) {
    return '';
  }

  return sanitized;
}

/**
 * Sanitize and ensure description has minimum content
 * Returns sanitized description or fallback if too short
 */
export function sanitizeDescriptionWithFallback(
  description: string,
  fallback: string = 'Dette produktet er en del av vårt utvalg av elektronikk og tilbehør. Vi leverer kvalitetsprodukter med fokus på funksjonalitet og verdi.'
): string {
  const sanitized = sanitizeDescription(description);
  
  if (!sanitized || sanitized.length < 20) {
    return fallback;
  }
  
  return sanitized;
}

