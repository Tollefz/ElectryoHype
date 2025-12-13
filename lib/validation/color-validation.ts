/**
 * Color validation for ElectroHypeX
 * 
 * Policy: Only BLACK/SVART colors are allowed for product variants
 */

const BLACK_COLORS = [
  'black', 'svart', 'BLACK', 'SVART', 'Black', 'Svart',
  '#000000', '#000', '000000', '000',
  'sort', 'Sort', 'SORT',
];

/**
 * Check if a color string represents black
 */
export function isBlackColor(color: string | null | undefined): boolean {
  if (!color) return false;
  const normalized = color.trim().toLowerCase();
  return BLACK_COLORS.some(black => black.toLowerCase() === normalized);
}

/**
 * Extract color from variant attributes or name
 */
export function extractColorFromVariant(variant: {
  attributes?: Record<string, any>;
  name?: string;
}): string | null {
  const attrs = variant.attributes || {};
  const colorFromAttrs = attrs.color || attrs.farge;
  if (colorFromAttrs) {
    return String(colorFromAttrs);
  }
  
  // Try to extract from variant name (e.g., "Rød - 2m" -> "Rød")
  const name = variant.name || '';
  const colorMatch = name.match(/^(Rød|Blå|Grønn|Gul|Hvit|Svart|Sort|Rosa|Lilla|Oransje|Brun|Grå|Red|Blue|Green|Yellow|White|Black|Pink|Purple|Orange|Brown|Grey|Gray)\s*-?/i);
  if (colorMatch) {
    return colorMatch[1];
  }
  
  return null;
}

/**
 * Validate and normalize color to black
 * 
 * @param color - The color to validate
 * @returns Normalized black color ("Svart") or null if no color specified
 * @throws Error if color is specified but not black
 */
export function validateAndNormalizeColor(color: string | null | undefined): string | null {
  if (!color) {
    return null; // No color specified is OK
  }
  
  const normalized = color.trim();
  
  if (isBlackColor(normalized)) {
    return 'Svart'; // Always use "Svart" as standard
  }
  
  // Color is specified but not black - this is an error
  throw new Error(
    `ElectroHypeX policy: Only BLACK/SVART colors are allowed. ` +
    `Received color: "${normalized}". Please use "Svart" or "Black" instead.`
  );
}

/**
 * Validate variant attributes to ensure color is black if specified
 */
export function validateVariantAttributes(attributes: Record<string, any>): Record<string, any> {
  const validated = { ...attributes };
  
  // Check color field
  if (validated.color !== undefined) {
    const normalizedColor = validateAndNormalizeColor(validated.color);
    validated.color = normalizedColor || 'Svart'; // Default to Svart if color was specified
    validated.farge = validated.color; // Also set Norwegian version
  }
  
  // Check farge field (Norwegian)
  if (validated.farge !== undefined) {
    const normalizedColor = validateAndNormalizeColor(validated.farge);
    validated.farge = normalizedColor || 'Svart';
    validated.color = validated.farge; // Also set English version
  }
  
  return validated;
}

