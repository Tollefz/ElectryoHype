/**
 * Decode URL-encoded strings (e.g., %C3%A5 -> å)
 */
export function decodeProductName(name: string): string {
  if (!name) return name;
  
  try {
    // Try to decode the entire string
    const decoded = decodeURIComponent(name);
    
    // Check if it contains more encoded sequences (double encoding)
    if (decoded.includes('%')) {
      return decodeURIComponent(decoded);
    }
    
    return decoded;
  } catch (error) {
    // If decoding fails, return original
    return name;
  }
}

/**
 * Clean up product names by removing URL-encoded characters and fixing encoding issues
 */
export function cleanProductName(name: string): string {
  if (!name) return name;
  
  let cleaned = name;
  
  // Remove URL-encoded characters
  try {
    cleaned = decodeProductName(cleaned);
  } catch {
    // Continue if decoding fails
  }
  
  // Replace common URL-encoded Norwegian characters
  cleaned = cleaned
    .replace(/%C3%A5/g, 'å')
    .replace(/%C3%A6/g, 'æ')
    .replace(/%C3%B8/g, 'ø')
    .replace(/%C3%85/g, 'Å')
    .replace(/%C3%86/g, 'Æ')
    .replace(/%C3%98/g, 'Ø')
    .replace(/%20/g, ' ')
    .replace(/\+/g, ' ');
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

