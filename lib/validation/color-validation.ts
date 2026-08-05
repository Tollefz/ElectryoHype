/**
 * Color validation and normalization for product variants.
 *
 * All supplier colors are allowed. Validation normalizes known color
 * names to consistent Norwegian naming and keeps the `color`/`farge`
 * attribute pair in sync.
 *
 * NOTE: The legacy "only BLACK/SVART variants" policy has been removed –
 * variants are imported exactly as the supplier provides them.
 */

/** Known color names mapped to consistent Norwegian naming. */
const COLOR_NORMALIZATION: Record<string, string> = {
  black: 'Svart',
  svart: 'Svart',
  sort: 'Svart',
  white: 'Hvit',
  hvit: 'Hvit',
  red: 'Rød',
  rød: 'Rød',
  blue: 'Blå',
  blå: 'Blå',
  green: 'Grønn',
  grønn: 'Grønn',
  yellow: 'Gul',
  gul: 'Gul',
  pink: 'Rosa',
  rosa: 'Rosa',
  purple: 'Lilla',
  lilla: 'Lilla',
  orange: 'Oransje',
  oransje: 'Oransje',
  brown: 'Brun',
  brun: 'Brun',
  grey: 'Grå',
  gray: 'Grå',
  grå: 'Grå',
  silver: 'Sølv',
  sølv: 'Sølv',
  gold: 'Gull',
  gull: 'Gull',
};

/**
 * Validate and normalize a color name.
 *
 * All colors are accepted. Known color names are normalized to
 * consistent Norwegian naming ("black" -> "Svart"); unknown colors
 * are kept as provided by the supplier.
 *
 * @param color - The color to normalize
 * @returns Normalized color name, or null if no color specified
 */
export function validateAndNormalizeColor(color: string | null | undefined): string | null {
  if (!color) {
    return null; // No color specified is OK
  }

  const trimmed = color.trim();
  if (!trimmed) {
    return null;
  }

  const known = COLOR_NORMALIZATION[trimmed.toLowerCase()];
  if (known) {
    return known;
  }

  // Unknown color – keep the supplier's value as-is
  return trimmed;
}

/**
 * Validate variant attributes: normalize color naming and keep the
 * color/farge attribute pair in sync. All colors are allowed.
 */
export function validateVariantAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const validated = { ...attributes };

  // Check color field
  if (validated.color !== undefined) {
    const normalizedColor = validateAndNormalizeColor(
      typeof validated.color === "string" ? validated.color : String(validated.color ?? "")
    );
    if (normalizedColor) {
      validated.color = normalizedColor;
      validated.farge = normalizedColor; // Also set Norwegian version
    } else {
      delete validated.color;
      delete validated.farge;
    }
  } else if (validated.farge !== undefined) {
    // Check farge field (Norwegian) when color is not set
    const normalizedColor = validateAndNormalizeColor(
      typeof validated.farge === "string" ? validated.farge : String(validated.farge ?? "")
    );
    if (normalizedColor) {
      validated.farge = normalizedColor;
      validated.color = normalizedColor; // Also set English version
    } else {
      delete validated.farge;
      delete validated.color;
    }
  }

  return validated;
}
