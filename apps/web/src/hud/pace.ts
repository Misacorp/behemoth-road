/**
 * Fast pace in the interface: the numbers and the small rules, free of the page so they are tested alone.
 * The day banner's length is the one tuning value of the web side.
 */
export const PACE_TUNING = {
  /** How long the day banner stays, fade in and out included. */
  dayBannerMs: 4000,
  /** How long its fade takes at each end. */
  bannerFadeMs: 400,
} as const;

/** The banner shows when the day number goes up (not on a first view, nor on a new season's lower day). */
export const dayIncreased = (previous: number | null, day: number): boolean =>
  previous !== null && day > previous;

/** How full the countdown ring is: 1 at the start, 0 when the day turns. */
export function ringFraction(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}
