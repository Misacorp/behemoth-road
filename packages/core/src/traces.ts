/**
 * Traces: marks the season leaves on the map, written when the event happens (the event log keeps only
 * 100) and read by nothing in the rules. Deterministic: a pure function of the events. Public.
 *
 * - a lit fire leaves a fire scar where it burned;
 * - the creature's step leaves a trail on the hexes its footprint left;
 * - a linger leaves a cairn under the creature;
 * - a threat with an `ending` of `pursuer` cleared leaves broken chain where it stood;
 * - a character lost leaves a small open gate where they were.
 *
 * At most `traceCap` are kept (the oldest trail goes first, then the oldest of any kind), and a trace
 * goes with its hex when the tile is pruned.
 */

import type { GameEvent } from './features.ts';
import { hexDistance, hexesInRange, hexKey } from './hex.ts';
import type { GameStateView, Trace } from './state.ts';
import { threatType } from './threats.ts';

/** The traces a batch of events adds, in order. `before` is the state the events started from. */
const tracesOf = (
  before: GameStateView,
  after: GameStateView,
  events: readonly GameEvent[],
): Trace[] => {
  const step = after.creature.steps;
  const made: Trace[] = [];
  for (const e of events) {
    switch (e.kind) {
      case 'fire-lit':
        made.push({ kind: 'fire', hex: e.hex, step, by: e.characterId });
        break;
      case 'creature-step': {
        // The hexes the footprint left; a lingering creature (from equals to) leaves none.
        const radius = after.config.creatureRadius;
        for (const h of hexesInRange(e.from, radius)) {
          if (hexDistance(h, e.to) > radius) made.push({ kind: 'trail', hex: h, step });
        }
        break;
      }
      case 'linger':
        made.push({ kind: 'cairn', hex: after.creature.centre, step, by: e.characterId });
        break;
      case 'threat-cleared': {
        const threat = before.threats.find((t) => t.id === e.id);
        if (threat && threatType(threat.type).ending === 'pursuer') {
          made.push({ kind: 'chain', hex: threat.hex, step, by: e.characterId });
        }
        break;
      }
      case 'lost':
        made.push({ kind: 'gate', hex: e.hex, step, by: e.characterId });
        break;
      default:
        break;
    }
  }
  return made;
};

/** The list with `made` added: a newer trace of the same kind on the same hex replaces the older; capped. */
export const addTraces = (
  list: readonly Trace[],
  made: readonly Trace[],
  cap: number,
): readonly Trace[] => {
  if (made.length === 0) return list;
  const next = [...list];
  for (const t of made) {
    const same = next.findIndex((x) => x.kind === t.kind && hexKey(x.hex) === hexKey(t.hex));
    if (same >= 0) next.splice(same, 1);
    next.push(t);
  }
  while (next.length > cap) {
    const trail = next.findIndex((x) => x.kind === 'trail');
    next.splice(trail >= 0 ? trail : 0, 1);
  }
  return next;
};

/** The state with the traces its events made. Does nothing when the story is off. */
export const recordTraces = <S extends GameStateView>(
  before: GameStateView,
  after: S,
  events: readonly GameEvent[],
): S => {
  if (!after.config.storyOn) return after;
  const made = tracesOf(before, after, events);
  if (made.length === 0) return after;
  return { ...after, traces: addTraces(after.traces, made, after.config.traceCap) };
};

/** Drops the traces whose hex has left the state's tiles (the tile was pruned with the fog). */
export const pruneTraces = <S extends GameStateView>(state: S): S => {
  const kept = state.traces.filter((t) => state.tiles[hexKey(t.hex)] !== undefined);
  return kept.length === state.traces.length ? state : { ...state, traces: kept };
};
