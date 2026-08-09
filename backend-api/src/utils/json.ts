/**
 * Shared JSON parsing utilities with graceful error handling
 */

/**
 * Safely parse a JSON string as an array.
 * Returns an empty array if:
 * - The input is null/undefined/empty
 * - Parsing fails (invalid JSON)
 * - The parsed result is not an array
 *
 * Used for parsing plan features/featuresBg columns which may contain malformed data
 * in production, while providing safe fallback behavior.
 */
export function safeParseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
