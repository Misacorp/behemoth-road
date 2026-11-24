import { MORNING } from '@behemoth-road/art';
import {
  act,
  createGame,
  type GameState,
  hex,
  nextDay,
  onHex,
  predictCreature,
  reachablePlaces,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { PROJECTION } from '../map/art.ts';
import { IDLE } from '../map/flow.ts';
import { mapTipAt } from '../map/mapTips.ts';
import { buildOverlays } from '../map/overlays.ts';
import { grabOption, throwOption } from './tow.ts';

const NEAR = hex(0, 2);
const place = (s: GameState, id: string, at: ReturnType<typeof hex>): GameState => ({
  ...s,
  characters: s.characters.map((c) => (c.id === id ? { ...c, at: onHex(at) } : c)),
});
const base = (towline = true): GameState => {
  const s = createGame(1, {
    characterIds: ['a', 'x'],
    config: { veerWeights: { left: 0, right: 0 } },
  });
  return place(nextDay(towline ? { ...s, unlocks: [...s.unlocks, 'towline'] } : s), 'x', NEAR);
};
const thrown = (): GameState => {
  const r = act(base(), 'a', { kind: 'throw-line', to: 'x' });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const marks = (s: GameState, id: string): string[] =>
  buildOverlays({
    state: s,
    flow: IDLE,
    characterId: id,
    reachable: reachablePlaces(s, id),
    predicted: predictCreature(s),
    projection: PROJECTION,
    palette: MORNING,
  }).over.flatMap((n) => (typeof n.attrs['data-mark'] === 'string' ? [n.attrs['data-mark']] : []));

describe('the tow line in the interface', () => {
  it('offers the throw to a rider only once the line is built, faded when it cannot be done', () => {
    expect(throwOption(base(false), 'a', 'x')).toBeNull();
    expect(throwOption(base(), 'a', 'x')).toEqual({ cost: 1, enabled: true });
    // Not offered from the ground.
    expect(throwOption(base(), 'x', 'a')).toBeNull();
    // Out of reach: faded, with the core's reason as a tip.
    const far = place(base(), 'x', hex(0, 5));
    expect(throwOption(far, 'a', 'x')).toMatchObject({ enabled: false, why: 'why:not-near' });
  });

  it('offers the grab only to the target, while the line lasts', () => {
    expect(grabOption(base(), 'x')).toBeNull();
    const s = thrown();
    expect(grabOption(s, 'x')).toEqual({ cost: 1, enabled: true });
    expect(grabOption(s, 'a')).toBeNull();
    expect(grabOption(nextDay(s), 'x')).toBeNull();
  });

  it('draws the line to the target for everyone, and a tip on their hex', () => {
    const s = thrown();
    expect(marks(s, 'a')).toContain('tow-line');
    expect(marks(s, 'x')).toContain('tow-line');
    expect(marks(base(), 'a')).not.toContain('tow-line');
    expect(mapTipAt(s, NEAR)).toBe('map:towline');
  });
});
