import type { ImportEditableField } from "@/lib/import/types";

export const IMPORT_FIELD_LABELS: Record<ImportEditableField, string> = {
  name: "Produktnavn",
  description: "Beskrivelse",
  shortDescription: "Kort beskrivelse",
  suggestedPrice: "Salgspris",
  compareAtPrice: "Før-pris",
  category: "Kategori",
  tags: "SEO-tags",
  slug: "Produkt-slug",
  metaTitle: "Meta-tittel",
  metaDescription: "Meta-beskrivelse",
};

export function getEditedFieldLabels(
  editedFields: Partial<Record<ImportEditableField, boolean>>
): string[] {
  return (Object.entries(editedFields) as [ImportEditableField, boolean][])
    .filter(([, edited]) => edited)
    .map(([field]) => IMPORT_FIELD_LABELS[field]);
}
