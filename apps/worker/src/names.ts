/** The longest display name kept, in code points. Discord's own limit is 32. */
export const MAX_DISPLAY_NAME_CODE_POINTS = 32;
export const FALLBACK_DISPLAY_NAME = 'Player';

/**
 * A Discord display name made safe to store and show as plain text: normalised, invisible and control
 * characters dropped, whitespace collapsed, cut to 32 code points. A name with nothing visible left
 * becomes the fallback. It is still rendered as text only, never as markup.
 */
export function sanitizeDisplayName(raw: string): string {
  const cleaned = raw
    .normalize('NFKC')
    // Zero-width and bidi characters are Cf, which JS also counts as whitespace (U+FEFF), so drop
    // them before collapsing whitespace.
    .replace(/[\p{Cf}\p{Cn}\p{Cs}]/gu, '')
    // Whitespace before other controls, so "a\nb" becomes "a b" instead of "ab".
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  // Array.from iterates by code point, so surrogate pairs are never split.
  const truncated = Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_CODE_POINTS).join('').trim();
  // Only combining marks and spaces: nothing visible to anchor them to.
  if (!/[^\p{M}\s]/u.test(truncated)) return FALLBACK_DISPLAY_NAME;
  return truncated;
}
