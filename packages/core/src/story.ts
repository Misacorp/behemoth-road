/**
 * The thin storylet engine (`docs/design/story.md`). After every act and every tick the core looks at
 * public facts only, queues the storylets (content `STORYLETS`) whose conditions have come true, and fires
 * the queue in order, at most `storyPerDay` a game day; the rest wait, none dropped. A fired id goes in
 * `state.story.fired` (never twice) and a public `story` event says which condition fired it.
 *
 * Nothing here reads the seed, the creature's nature or care, or a hidden feature: `holds` takes a
 * `GameStateView`, so the type of its input has none of them. The order is the content's, so the same
 * state and inputs always give the same story.
 */

import type { Condition, Storylet } from './content/index.ts';
import { STORYLETS } from './content/index.ts';
import type { GameEvent } from './features.ts';
import { type Hex, hexKey } from './hex.ts';
import { terrainById } from './map.ts';
import type { GameStateView, StoryQueued, StoryState } from './state.ts';
import { threatType } from './threats.ts';
import { creatureHexes } from './window.ts';

/** A condition that holds, and the hex it names (for a `hex` anchor), if it names one. */
interface Hit {
  readonly hex?: Hex;
}

/** Whether a route fraction has been walked: steps over the route's length, with a little for floats. */
const walked = (state: GameStateView, fraction: number): boolean =>
  state.creature.steps >= fraction * state.config.routeLength - 1e-9;

/** The one place conditions are read: public facts of the view, nothing else. */
const holds = (state: GameStateView, c: Condition): Hit | null => {
  switch (c.kind) {
    case 'route':
      return walked(state, c.fraction) ? {} : null;
    case 'footprint-touches': {
      for (const h of creatureHexes(state)) {
        const tile = state.tiles[hexKey(h)];
        if (tile && terrainById(tile.terrain).tags.includes(c.tag)) return { hex: h };
      }
      return null;
    }
    case 'threat-ending': {
      const t = state.threats.find((x) => threatType(x.type).ending === c.ending);
      return t ? { hex: t.hex } : null;
    }
    case 'settlement-in-view': {
      const s = state.settlements[0];
      return s ? { hex: s.hex } : null;
    }
  }
};

/** A condition as a short label for the `when` of an event: `kind` or `kind:parameter`. */
export const conditionLabel = (c: Condition): string => {
  switch (c.kind) {
    case 'route':
      return `route:${c.fraction}`;
    case 'footprint-touches':
      return `footprint-touches:${c.tag}`;
    case 'threat-ending':
      return `threat-ending:${c.ending}`;
    case 'settlement-in-view':
      return 'settlement-in-view';
  }
};

/** Whether all of a storylet's conditions hold now, with the hex it is anchored to and the label. */
export const storyletHolds = (
  state: GameStateView,
  storylet: Storylet,
): { readonly hex: Hex | null; readonly when: string } | null => {
  let hex: Hex | null = null;
  for (const c of storylet.when) {
    const hit = holds(state, c);
    if (!hit) return null;
    hex ??= hit.hex ?? null;
  }
  return { hex, when: storylet.when.map(conditionLabel).join('+') };
};

/**
 * Queues what has come true and fires what the day's cap allows. Returns the state with its new
 * `story` and the `story` events in the order they fired. Does nothing once the season is over (the
 * ending takes over) or when the story is off.
 */
export const fireStory = <S extends GameStateView>(
  state: S,
): { readonly state: S; readonly events: readonly GameEvent[] } => {
  if (!state.config.storyOn || state.season.status === 'over') return { state, events: [] };
  const story = state.story;
  const known = new Set([...story.fired, ...story.queue.map((q) => q.id)]);
  const queue: StoryQueued[] = [...story.queue];
  for (const s of STORYLETS) {
    if (s.kind !== 'beat' || known.has(s.id)) continue;
    const hit = storyletHolds(state, s);
    if (hit) queue.push({ id: s.id, hex: s.anchor === 'hex' ? hit.hex : null, when: hit.when });
  }
  const sameDay = story.today.day === state.day;
  let count = sameDay ? story.today.count : 0;
  const fired = [...story.fired];
  const events: GameEvent[] = [];
  while (queue.length > 0 && count < state.config.storyPerDay) {
    const next = queue.shift() as StoryQueued;
    fired.push(next.id);
    count += 1;
    events.push({
      kind: 'story',
      id: next.id,
      step: state.creature.steps,
      anchor: next.hex ? { kind: 'hex', hex: next.hex } : { kind: 'creature' },
      when: next.when,
    });
  }
  const next: StoryState = { fired, queue, today: { day: state.day, count } };
  const unchanged =
    events.length === 0 &&
    queue.length === story.queue.length &&
    story.today.day === next.today.day &&
    story.today.count === next.today.count;
  return unchanged ? { state, events } : { state: { ...state, story: next }, events };
};
