import {
  figureAnchor,
  GENTLE_AMBLER,
  hexCenter,
  isometric,
  renderSceneFramed,
  riderAnchor,
} from '@behemoth-road/art';
import {
  createGame,
  directionOffset,
  type GameState,
  onHex,
  ON_CREATURE,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { characterArts, creatureArt, sceneCells } from './cells.ts';
import { PALETTE } from './art.ts';
import { figureFeet, pickableFeet, placePoint, seatSlot } from './figures.ts';

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

  it('match where the scene draws each figure: three riders and one walker', () => {
    const base = game(['a', 'b', 'c', 'd']);
    const s: GameState = {
      ...base,
      characters: base.characters.map((c) =>
        c.id === 'b' ? { ...c, at: onHex({ q: 0, r: 4 }) } : c,
      ),
    };
    const { figures } = renderSceneFramed({
      cells: sceneCells(s),
      creature: creatureArt(s),
      characters: characterArts(s),
      projection: p,
      palette: PALETTE,
      seed: s.seed,
      frame: 'none',
    });
    for (const id of ['a', 'b', 'c', 'd'])
      expect(figureFeet(s, id, p), id).toEqual(figures.get(id));
    expect([seatSlot(s, 'a'), seatSlot(s, 'c'), seatSlot(s, 'd')]).toEqual([0, 1, 2]);
  });

  it('makes only characters on hexes tap targets, never riders', () => {
    const base = game(['a', 'b']);
    expect(pickableFeet(base, 'a', p)).toEqual({ mine: null, others: [] });
    const s: GameState = {
      ...base,
      characters: base.characters.map((c) => ({ ...c, at: onHex({ q: 0, r: 4 }) })),
    };
    const feet = pickableFeet(s, 'a', p);
    expect(feet.mine).toEqual(figureFeet(s, 'a', p));
    expect(feet.others).toEqual([figureFeet(s, 'b', p)]);
  });
});
