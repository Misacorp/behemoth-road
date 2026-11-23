import { MORNING } from '@behemoth-road/art';
import {
  createGame,
  creatureEdge,
  type GameState,
  type Hex,
  neighbour,
  onHex,
  predictCreature,
  reachablePlaces,
  THREAT_TYPES,
  threatOutlook,
  toPlayerView,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { threatNextPath } from '../game/season.ts';
import { PROJECTION } from './art.ts';
import { type Flow, IDLE } from './flow.ts';
import { buildOverlays } from './overlays.ts';

const ID = 'you';
const AT: Hex = { q: 0, r: 4 };

/** One character standing on `AT`, one threat of `type` on `at`. */
const game = (type: string, at: Hex = AT): ReturnType<typeof toPlayerView> => {
  const base = createGame(20261119, { characterIds: [ID] });
  const s: GameState = {
    ...base,
    characters: base.characters.map((c) => ({ ...c, at: onHex(AT) })),
    threats: [{ id: 't1', type, hex: at, strength: 3, appearedDay: base.day }],
  };
  return toPlayerView(s);
};

const marks = (state: ReturnType<typeof game>, flow: Flow): unknown[] =>
  buildOverlays({
    state,
    flow,
    characterId: ID,
    reachable: reachablePlaces(state, ID),
    predicted: predictCreature(state),
    projection: PROJECTION,
    palette: MORNING,
  }).over.map((m) => m.attrs['data-mark']);

describe('the danger cue on a planned path', () => {
  const planned = (steps: Hex[]): Flow => ({
    kind: 'planned',
    to: onHex(steps.at(-1)!),
    steps: steps.map((h) => ({ place: onHex(h), cost: 1 })),
    cost: steps.length,
  });

  it('marks a hex of the path that holds a rockslide, and nothing for other hexes or threats', () => {
    const slide = game('rockslide', { q: 0, r: 3 });
    expect(
      marks(
        slide,
        planned([
          { q: 0, r: 3 },
          { q: 0, r: 2 },
        ]),
      ),
    ).toContain('path-danger');
    expect(
      marks(
        slide,
        planned([
          { q: 1, r: 3 },
          { q: 1, r: 2 },
        ]),
      ),
    ).not.toContain('path-danger');
    // A moving threat strikes beside it, not on entering: no cue on its hex.
    const captors = game('captors', { q: 0, r: 3 });
    expect(
      marks(
        captors,
        planned([
          { q: 0, r: 3 },
          { q: 0, r: 2 },
        ]),
      ),
    ).not.toContain('path-danger');
  });
});

describe('a threat sharing your hex, and its next-tick mark', () => {
  it('draws its trail while you are selected on its hex, with no card open', () => {
    const view = game('captors');
    expect(threatNextPath(view, 't1').length).toBeGreaterThan(0);
    const selected = marks(view, { kind: 'selected' });
    expect(selected).toContain('threat-trail');
    expect(selected).toContain('threat-end');
    expect(marks(view, IDLE)).not.toContain('threat-trail');
  });

  it('outlines the creature under a strike badge when the threat arrives at the next tick, and only then', () => {
    const near = game('captors', creatureEdge(createGame(1, { characterIds: [ID] }))[0]);
    expect(threatOutlook(near)[0]!.arrives).toBe('tomorrow');
    expect(marks(near, { kind: 'threat', id: 't1' })).toContain('threat-arrives');
    const far = game('captors');
    expect(threatOutlook(far)[0]!.arrives).not.toBe('tomorrow');
    expect(marks(far, { kind: 'threat', id: 't1' })).not.toContain('threat-arrives');
  });

  it('rings the hex of a threat that waits when the creature walks into it', () => {
    const { centre, heading } = createGame(1, { characterIds: [ID] }).creature;
    let ahead = centre;
    for (let i = 0; i < 2; i++) ahead = neighbour(ahead, heading);
    const view = game('rockslide', ahead);
    expect(threatNextPath(view, 't1')).toEqual([]);
    expect(threatOutlook(view)[0]!.arrives).toBe('tomorrow');
    const m = marks(view, { kind: 'threat', id: 't1' });
    expect(m).toContain('threat-end');
    expect(m).toContain('threat-arrives');
    expect(m).not.toContain('threat-trail');
  });

  it('shows a trail and a ringed end for every threat type that moves', () => {
    for (const type of THREAT_TYPES.filter((t) => t.speed > 0)) {
      const m = marks(game(type.id, { q: 4, r: 3 }), { kind: 'threat', id: 't1' });
      expect(m, type.id).toContain('threat-trail');
      expect(m, type.id).toContain('threat-end');
    }
  });
});
