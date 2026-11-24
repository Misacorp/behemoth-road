import { createGame, hex, hexKey, nextDay, onHex } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { TERRAIN_LOOKS } from '@behemoth-road/art';
import { TERRAIN_TYPES } from '@behemoth-road/core';
import { cellStateAt, characterArts, creatureArt, featureArtAt, sceneCells } from './cells.ts';
import { MAP_TUNING } from './config.ts';
import { mapTipAt } from './mapTips.ts';

describe('scene cells', () => {
  const s = createGame(1, { characterIds: ['you'] });

  it('draw the window, and blank paper a few rings beyond', () => {
    const r = s.config.windowRadius + MAP_TUNING.paperRings;
    const cells = sceneCells(s);
    expect(cells).toHaveLength(1 + 3 * r * (r + 1));
    // The window: explored ground clear, the rest under the veil.
    const inWindow = cells.filter((c) => c.state === 'seen' || c.state === 'unexplored');
    expect(inWindow).toHaveLength(1 + 3 * s.config.windowRadius * (s.config.windowRadius + 1));
    for (const c of inWindow) {
      expect(c.state).toBe(s.tiles[`${c.q},${c.r}`]!.explored ? 'seen' : 'unexplored');
    }
    for (const c of cells.filter((x) => x.state === 'unseen')) expect(c.terrain).toBe('unknown');
  });

  it('show tiles that left the window as fading, then lost', () => {
    const next = nextDay(s);
    const fading = Object.keys(next.tiles).filter((k) => cellStateAt(next, k) === 'fading');
    expect(fading.length).toBeGreaterThan(0);
    const later = nextDay(next);
    expect(fading.some((k) => cellStateAt(later, k) === 'lost')).toBe(true);
    expect(cellStateAt(s, hexKey({ q: 99, r: 99 }))).toBe('unseen');
  });

  it('find an art look for every core terrain id, and face the creature by its heading', () => {
    for (const t of TERRAIN_TYPES) expect(TERRAIN_LOOKS[t.id], t.id).toBeDefined();
    expect(creatureArt(createGame(1, { heading: 'nw' })).heading).toEqual({ q: -1, r: 0 });
    expect(creatureArt(createGame(1, { heading: 'n' })).heading).toEqual({ q: 0, r: -1 });
  });
});

describe('feature art and the creature art', () => {
  const s = createGame(1, { characterIds: ['you'] });

  it('marks every revealed trap as a trap, whatever its look, and no other feature', () => {
    const at = (type: string, left = 1) => ({
      ...s,
      features: { '0,0': { type, revealed: true, left } },
    });
    expect(featureArtAt(at('snare'), '0,0')).toEqual({ look: 'snare', trap: true });
    expect(featureArtAt(at('pitfall'), '0,0')).toEqual({ look: 'pitfall', trap: true });
    expect(featureArtAt(at('iron-deposit'), '0,0')).toEqual({ look: 'ore' });
    expect(
      featureArtAt(
        { ...s, features: { '0,0': { type: 'snare', revealed: false, left: 1 } } },
        '0,0',
      ),
    ).toBeNull();
  });

  it('counts the wardens defending the creature, for every player', () => {
    expect(creatureArt(s).defenders).toBe(0);
    const defended = { ...s, creature: { ...s.creature, defenders: ['a', 'b'] } };
    expect(creatureArt(defended).defenders).toBe(2);
  });
});

describe('glints', () => {
  const s = createGame(1, { characterIds: ['you'] });
  const c = s.creature.centre;

  it("mark only the viewer's glinting hexes with the hint, and nothing without them", () => {
    expect(sceneCells(s).some((x) => x.hint)).toBe(false);
    const glinting = [
      { q: c.q + 1, r: c.r },
      { q: c.q, r: c.r + 2 },
    ];
    const hinted = sceneCells(s, glinting).filter((x) => x.hint);
    expect(hinted.map((x) => `${x.q},${x.r}`).sort()).toEqual(glinting.map(hexKey).sort());
  });
});

describe('the stranded flare', () => {
  const straight = { veerWeights: { left: 0, right: 0 } };
  const grace = () => {
    const start = createGame(1, { characterIds: ['a', 'b'], config: straight });
    const placed = {
      ...start,
      characters: start.characters.map((c) => (c.id === 'a' ? { ...c, at: onHex(hex(0, 6)) } : c)),
    };
    return nextDay(placed);
  };
  const flare = (s: ReturnType<typeof grace>, id: string) =>
    characterArts(s).find((c) => c.id === id)?.marks?.stranded === true;

  it('shows over a figure on a grace hex that cannot get back, for every viewer', () => {
    const s = grace();
    expect(flare(s, 'a')).toBe(false);
    const cut = {
      ...s,
      characters: s.characters.map((c) => (c.id === 'a' ? { ...c, actionsLeft: 0 } : c)),
    };
    expect(flare(cut, 'a')).toBe(true);
    expect(flare(cut, 'b')).toBe(false);
    expect(mapTipAt(cut, hex(0, 6))).toBe('map:stranded');
    expect(mapTipAt(s, hex(0, 6))).toBeNull();
  });
});
