/**
 * URL normalization utilities shared across AI Fund components.
 */

/**
 * Normalize a URL for comparison: lowercase, strip trailing slashes,
 * remove query params and fragments.
 */
export function normalizeComparableUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    // Keep protocol + host + pathname, strip search + hash
    return (url.origin + url.pathname).toLowerCase().replace(/\/+$/, "");
  } catch {
    // Not a valid URL — fall back to simple normalization
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}
