/**
 * Moments: short visual beats on the map, with no prose. A hex explored (its veil lifts), a survey, a reveal
 * (an ink bloom), a find (the material's icon rising from the site), a sprung trap (a snap; your pips go dark
 * when it caught you), a deposit into the stores and a finished unlock (on the creature). They come only from
 * the server's events (your own move or action, and the log of what others and the tick did since your last
 * view), so they show for anything that happened, whoever did it. They are CSS animations (no per-frame
 * renders) and end by themselves.
 */
import type { Hex } from '@behemoth-road/core';

export type Moment =
  | { readonly kind: 'explore'; readonly hex: Hex }
  | { readonly kind: 'survey'; readonly hex: Hex }
  | { readonly kind: 'reveal'; readonly hex: Hex }
  | { readonly kind: 'find'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'trap'; readonly hex: Hex; readonly mine: boolean }
  | { readonly kind: 'deposit'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'unlock'; readonly hex: Hex; readonly item: string };

/** How long a moment stays on screen, in ms (its CSS animation is as long). */
export const MOMENT_MS = 1400;

/** The part of an event the moments read (the core's `GameEvent`, as parsed). */
export interface EventLike {
  readonly kind: string;
  readonly characterId?: string | undefined;
  readonly hex?: Hex | undefined;
  readonly material?: string | undefined;
  readonly unlock?: string | undefined;
  readonly materials?: Readonly<Record<string, number>> | undefined;
}

/** The material there is most of, if any. */
function most(materials: Readonly<Record<string, number>>): string | null {
  let best: string | null = null;
  let top = 0;
  for (const [id, n] of Object.entries(materials)) if (n > top) [best, top] = [id, n];
  return best;
}

/**
 * Moments from server events, in order. `centre` is where the creature stands (deposits and unlocks show
 * there); `me` is your character (a trap that caught it darkens your pips). Kinds without a moment (gather,
 * a failed site, unlock progress, the tick's own) and unknown kinds are skipped, so new events never break
 * the map.
 */
export function momentsFromEvents(events: readonly EventLike[], centre: Hex, me: string): Moment[] {
  const out: Moment[] = [];
  for (const e of events) {
    if (e.kind === 'deposit' && e.materials) {
      const item = most(e.materials);
      if (item) out.push({ kind: 'deposit', hex: centre, item });
    } else if (e.kind === 'unlock-done' && e.unlock) {
      out.push({ kind: 'unlock', hex: centre, item: e.unlock });
    } else if (!e.hex) {
      continue;
    } else if (e.kind === 'explore' || e.kind === 'survey' || e.kind === 'reveal') {
      out.push({ kind: e.kind, hex: e.hex });
    } else if (e.kind === 'trap') {
      out.push({ kind: 'trap', hex: e.hex, mine: e.characterId === me });
    } else if (e.kind === 'find' && e.material) {
      out.push({ kind: 'find', hex: e.hex, item: e.material });
    }
  }
  return out;
}

/** A key per event, for playing each once: its version and its place among that version's events. */
export function eventKeys(events: readonly { readonly version: number }[]): string[] {
  const seen = new Map<number, number>();
  return events.map((e) => {
    const i = seen.get(e.version) ?? 0;
    seen.set(e.version, i + 1);
    return `${String(e.version)}:${String(i)}`;
  });
}
