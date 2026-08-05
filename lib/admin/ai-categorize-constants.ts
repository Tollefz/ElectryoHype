/** Client-safe constants for AI categorization (no server-only imports). */

export const AI_CATEGORY_BATCH_SIZE = 20;
/** Auto-apply when confidence >= this (V2: uncertain products go to review). */
export const AI_CATEGORY_AUTO_MIN = 90;
/** Review queue when confidence is below AUTO_MIN. */
export const AI_CATEGORY_APPROVAL_MIN = 90;
