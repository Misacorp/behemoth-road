import { figureAnchor, GENTLE_AMBLER, hexCenter, isometric, riderAnchor } from '@behemoth-road/art';
import {
  createGame,
  directionOffset,
  type GameState,
  onHex,
  ON_CREATURE,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { figureFeet, placePoint, seatSlot } from './figures.ts';
import { pickTarget, worldToHex } from './pick.ts';

const p = isometric(64, 0.8);
const game = (ids: string[]): GameState => createGame(20261119, { characterIds: ids });

describe('figure positions', () => {
  it('seats riders in character order, matching the art kit', () => {
    const s = game(['a', 'b', 'c']);
    const origin = hexCenter(p, s.creature.centre.q, s.creature.centre.r);
    const heading = directionOffset(s.creature.heading);
    ['a', 'b', 'c'].forEach((id, slot) => {
      expect(seatSlot(s, id)).toBe(slot);
      expect(figureFeet(s, id, p)).toEqual(
        riderAnchor(GENTLE_AMBLER, heading, slot, origin, p.size, p.squash),
      );
    });
  });

  it('puts a character on a hex at its standee spot, and boarding at the next free seat', () => {
    const h = { q: 0, r: 4 };
    const base = game(['a', 'b']);
    const s: GameState = {
      ...base,
      characters: base.characters.map((c) => (c.id === 'a' ? { ...c, at: onHex(h) } : c)),
    };
    expect(figureFeet(s, 'a', p)).toEqual(figureAnchor(p, h, 0));
    // 'b' rides alone in slot 0; 'a' would take slot 0 too (it comes first in order).
    expect(seatSlot(s, 'b')).toBe(0);
    expect(placePoint(s, 'a', ON_CREATURE, p)).toEqual(figureFeet(game(['a']), 'a', p));
    expect(figureFeet(s, 'nobody', p)).toBeNull();
  });

  it('picks a rider at tilt 0.8 by its figure on the back, not the footprint hex under it', () => {
    const s = game(['a']);
    const feet = figureFeet(s, 'a', p)!;
    const body = { x: feet.x, y: feet.y - 0.4 * p.size };
    expect(pickTarget(p, body, feet)).toEqual({ kind: 'me' });
    // Without the figure, the same point is just one of the creature's hexes.
    const under = worldToHex(p, body);
    expect(Math.abs(under.q) + Math.abs(under.r) + Math.abs(under.q + under.r)).toBeLessThanOrEqual(
      2,
    );
    // Beside the figure, a tap means the hex.
    const beside = { x: feet.x + 0.6 * p.size, y: feet.y };
    expect(pickTarget(p, beside, feet)).toEqual({ kind: 'hex', hex: worldToHex(p, beside) });
  });
});
