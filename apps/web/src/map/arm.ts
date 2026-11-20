/**
 * Spending takes two taps on the same button: the first arms it (its pips give way to a tick), the
 * second spends. A tap on another button arms that one instead, so a stray tap on a card never spends.
 * Pure, so the rule is tested directly; the map keeps the armed key and drops it when the card changes.
 */

export interface Press {
  /** The button armed after this press, or null. */
  readonly armed: string | null;
  /** Whether this press spends (the button was already armed). */
  readonly run: boolean;
}

/** What a press on the button `key` does, given the one armed before it. Disabled buttons never arm. */
export function press(armed: string | null, key: string, enabled: boolean): Press {
  if (!enabled) return { armed, run: false };
  if (armed === key) return { armed: null, run: true };
  return { armed: key, run: false };
}

/**
 * What stays armed when the card's buttons change under it (a refresh): the armed button only while it is
 * still offered and enabled, so a button disabled and enabled again by two refreshes needs both taps anew.
 */
export const armedAfter = (armed: string | null, enabled: readonly string[]): string | null =>
  armed !== null && enabled.includes(armed) ? armed : null;
