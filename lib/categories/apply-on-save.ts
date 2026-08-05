/**
 * Hard-gate: run Category Engine before any import persist.
 */

import "server-only";

import {
  assignCategory,
  assignmentToProductFields,
  mergeSubcategoryIntoSpecs,
  type AssignCategoryInput,
  type CategoryAssignment,
} from "@/lib/categories/engine";

export type CategoryPersistFields = ReturnType<typeof assignmentToProductFields> & {
  specsPatch: Record<string, unknown>;
  assignment: CategoryAssignment;
};

/**
 * Analyze product payload and return DB fields ready to spread into create/update.
 */
export async function categorizeForSave(
  input: AssignCategoryInput & { existingSpecs?: unknown }
): Promise<CategoryPersistFields> {
  const assignment = await assignCategory(input);
  const fields = assignmentToProductFields(assignment);
  const specsPatch = mergeSubcategoryIntoSpecs(
    input.existingSpecs,
    assignment.subcategory
  );
  return {
    ...fields,
    specsPatch,
    assignment,
  };
}
