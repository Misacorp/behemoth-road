/**
 * Moments: short visual beats on the map when the view changes, with no prose. A hex explored (its veil
 * lifts), a survey, a reveal (an ink bloom), a find (the material's icon rising from the site), a sprung trap
 * (a snap, and your pips going dark), a deposit into the stores and a finished unlock (on the creature), a
 * fire lit (on its hex), a feeding and a linger (on the creature).
 * They come from the events of your own move or action, and otherwise from comparing two views, so they
 * show for anything that happened, whoever did it. They are CSS animations (no per-frame renders) and end
 * by themselves.
 */
import { type GameStateView, type Hex, hexKey, keyToHex, MATERIALS } from '@behemoth-road/core';
import { featureAt } from './chain.ts';

export type Moment =
  | { readonly kind: 'explore'; readonly hex: Hex }
  | { readonly kind: 'survey'; readonly hex: Hex }
  | { readonly kind: 'reveal'; readonly hex: Hex }
  | { readonly kind: 'find'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'trap'; readonly hex: Hex }
  | { readonly kind: 'deposit'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'unlock'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'fire'; readonly hex: Hex }
  | { readonly kind: 'feed'; readonly hex: Hex; readonly item: string | null }
  | { readonly kind: 'linger'; readonly hex: Hex };

/** How long a moment stays on screen, in ms (its CSS animation is as long). */
export const MOMENT_MS = 1400;

const explored = (g: GameStateView, key: string): boolean => g.tiles[key]?.explored === true;

/** The material that went up the most between two counts, if any. */
function grew(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): string | null {
  let best: string | null = null;
  let most = 0;
  for (const [id, n] of Object.entries(after)) {
    const up = n - (before[id] ?? 0);
    if (up > most) [best, most] = [id, up];
  }
  return best;
}

/** The moments between the view before and after, for the player whose character is `me`. */
export function momentsBetween(before: GameStateView, after: GameStateView, me: string): Moment[] {
  const out: Moment[] = [];
  for (const key of Object.keys(after.tiles)) {
    if (explored(after, key) && !explored(before, key))
      out.push({ kind: 'explore', hex: keyToHex(key) });
  }
  const mineBefore = before.characters.find((c) => c.id === me);
  const mineAfter = after.characters.find((c) => c.id === me);
  // A trap shows only where it caught you: your day ended on a newly revealed trap.
  const caughtAt =
    mineAfter?.at.kind === 'hex' &&
    (mineBefore?.actionsLeft ?? 0) > 0 &&
    mineAfter.actionsLeft === 0 &&
    after.day === before.day
      ? mineAfter.at.hex
      : null;
  for (const key of Object.keys(after.features)) {
    const hex = keyToHex(key);
    const now = featureAt(after, hex);
    if (!now) continue;
    const was = featureAt(before, hex);
    if (!was) {
      const caught = caughtAt !== null && caughtAt.q === hex.q && caughtAt.r === hex.r;
      out.push({ kind: now.type.kind === 'trap' && caught ? 'trap' : 'reveal', hex });
    } else if (now.type.kind === 'site' && now.left === 0 && was.left > 0) {
      // A site opened: the find went into someone's pack.
      for (const c of after.characters) {
        const item = grew(before.characters.find((b) => b.id === c.id)?.pack ?? {}, c.pack);
        if (item) {
          out.push({ kind: 'find', hex, item });
          break;
        }
      }
    }
  }
  const centre = after.creature.centre;
  const stored = grew(before.stores, after.stores);
  if (stored) out.push({ kind: 'deposit', hex: centre, item: stored });
  for (const u of after.unlocks) {
    if (!before.unlocks.includes(u)) out.push({ kind: 'unlock', hex: centre, item: u });
  }
  const lit = new Set(before.stimuli.map((f) => hexKey(f.hex)));
  for (const f of after.stimuli) {
    if (!lit.has(hexKey(f.hex))) out.push({ kind: 'fire', hex: f.hex });
  }
  if (after.day === before.day) {
    // Within a day, food leaves the stores only when someone feeds the creature.
    const eaten = FOODS.find((id) => (after.stores[id] ?? 0) < (before.stores[id] ?? 0));
    if (eaten) out.push({ kind: 'feed', hex: centre, item: eaten });
  }
  if (after.creature.lingering && !before.creature.lingering) {
    out.push({ kind: 'linger', hex: centre });
  }
  return out;
}

/** Materials the creature eats (tagged `food`), in content order. */
const FOODS: readonly string[] = MATERIALS.filter((m) => m.tags.includes('food')).map((m) => m.id);

/** The part of an event the moments read (the core's `GameEvent`, as parsed). */
export interface EventLike {
  readonly kind: string;
  readonly hex?: Hex | undefined;
  readonly material?: string | undefined;
  readonly unlock?: string | undefined;
  readonly materials?: Readonly<Record<string, number>> | undefined;
}

/**
 * Moments from the events the server returned with your own move or action, in order. `centre` is where
 * the creature stands (deposits, unlocks, feeding and lingering show there). Kinds without a moment (gather, a failed site,
 * unlock progress) and unknown kinds are skipped, so new events never break the map.
 */
export function momentsFromEvents(events: readonly EventLike[], centre: Hex): Moment[] {
  const out: Moment[] = [];
  for (const e of events) {
    if (e.kind === 'fed') {
      out.push({ kind: 'feed', hex: centre, item: e.material ?? null });
    } else if (e.kind === 'linger') {
      out.push({ kind: 'linger', hex: centre });
    } else if (e.kind === 'fire-lit' && e.hex) {
      out.push({ kind: 'fire', hex: e.hex });
    } else if (e.kind === 'deposit' && e.materials) {
      const item = grew({}, e.materials);
      if (item) out.push({ kind: 'deposit', hex: centre, item });
    } else if (e.kind === 'unlock-done' && e.unlock) {
      out.push({ kind: 'unlock', hex: centre, item: e.unlock });
    } else if (!e.hex) {
      continue;
    } else if (
      e.kind === 'explore' ||
      e.kind === 'survey' ||
      e.kind === 'reveal' ||
      e.kind === 'trap'
    ) {
      out.push({ kind: e.kind, hex: e.hex });
    } else if (e.kind === 'find' && e.material) {
      out.push({ kind: 'find', hex: e.hex, item: e.material });
    }
  }
  return out;
}
