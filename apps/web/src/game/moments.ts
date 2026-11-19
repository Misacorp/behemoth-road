/**
 * Moments: short visual beats on the map when the view changes, with no prose. A reveal (an ink bloom on
 * the hex), a find (the found thing's icon rising from the site) and a triggered trap (a snap mark at your
 * character, and your pips going dark). They come from comparing two views, so they show for anything that
 * happened, whoever did it; they are drawn with CSS animations (no per-frame renders) and end by themselves.
 */
import type { GameStateView, Hex } from '@behemoth-road/core';
import { chainOf } from './chain.ts';

export type Moment =
  | { readonly kind: 'reveal'; readonly hex: Hex }
  | { readonly kind: 'find'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'trap'; readonly hex: Hex };

/** How long a moment stays on screen, in ms (its CSS animation is as long). */
export const MOMENT_MS = 1400;

const hexOf = (key: string): Hex => {
  const [q, r] = key.split(',').map(Number) as [number, number];
  return { q, r };
};

/** The moments between the view before and after, for the player whose character is `me`. */
export function momentsBetween(before: GameStateView, after: GameStateView, me: string): Moment[] {
  const a = chainOf(before);
  const b = chainOf(after);
  const out: Moment[] = [];
  for (const [key, f] of b.features) {
    const was = a.features.get(key);
    if (!was) {
      out.push(
        f.kind === 'trap' ? { kind: 'trap', hex: hexOf(key) } : { kind: 'reveal', hex: hexOf(key) },
      );
      continue;
    }
    if (f.kind === 'site' && f.spent && !was.spent) {
      // A site opened: what came into the inventory is the find.
      const found = [...b.inventory].find(([id, n]) => n > (a.inventory.get(id) ?? 0))?.[0];
      out.push({ kind: 'find', hex: hexOf(key), item: found ?? f.id });
    }
  }
  // A trap shows only where it caught you: your day ended on a newly revealed trap.
  const mineBefore = before.characters.find((c) => c.id === me);
  const mineAfter = after.characters.find((c) => c.id === me);
  const caught =
    mineAfter?.at.kind === 'hex' &&
    (mineBefore?.actionsLeft ?? 0) > 0 &&
    mineAfter.actionsLeft === 0 &&
    after.day === before.day;
  // Elsewhere (a scout revealing it, someone else caught), a trap is just a reveal.
  return out.map((m) =>
    m.kind !== 'trap' ||
    (caught &&
      mineAfter.at.kind === 'hex' &&
      m.hex.q === mineAfter.at.hex.q &&
      m.hex.r === mineAfter.at.hex.r)
      ? m
      : { kind: 'reveal', hex: m.hex },
  );
}

/**
 * Moments from the events the server returned with your own move or action (the core's event list), in
 * order. Unknown kinds are skipped, so new events never break the map.
 */
export function momentsFromEvents(
  events: readonly {
    readonly kind: string;
    readonly hex?: Hex | undefined;
    readonly item?: string | undefined;
  }[],
): Moment[] {
  const out: Moment[] = [];
  for (const e of events) {
    if (!e.hex) continue;
    if (e.kind === 'revealed' || e.kind === 'reveal') out.push({ kind: 'reveal', hex: e.hex });
    else if (e.kind === 'trap') out.push({ kind: 'trap', hex: e.hex });
    else if ((e.kind === 'found' || e.kind === 'find') && e.item) {
      out.push({ kind: 'find', hex: e.hex, item: e.item });
    }
  }
  return out;
}
