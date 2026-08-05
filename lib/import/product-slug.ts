import slugify from "slugify";

/**
 * Generate a clean URL slug from a product title.
 * Slashes become hyphens so "iPhone 16/15" -> "iphone-16-15".
 */
export function generateProductSlug(title: string): string {
  return slugify(title.replace(/[/+]/g, "-"), {
    lower: true,
    strict: true,
    locale: "nb",
  });
}
