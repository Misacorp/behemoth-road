/**
 * The grace day, end to end through the map's own layers (cells, flow, overlays) on top of the core: a hex
 * that leaves the window at the tick into day D stays reachable through day D and is lost at the next tick.
 */
import { MORNING } from '@behemoth-road/art';
import {
  createGame,
  findCharacter,
  type GameState,
  type Hex,
  hexKey,
  isPassable,
  isCreatureHex,
  isInWindow,
  nextDay,
  onHex,
  predictCreature,
  reachablePlaces,
  windowHexes,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { PROJECTION } from './art.ts';
import { cellStateAt } from './cells.ts';
import { confirmMove, type Flow, IDLE, tap, tapHex } from './flow.ts';
import { buildOverlays } from './overlays.ts';

const ID = 'you';
const at = (s: GameState, h: Hex): GameState => ({
  ...s,
  characters: s.characters.map((c) => ({ ...c, at: onHex(h) })),
});
const me = (s: GameState) => findCharacter(s, ID)!;
const marks = (s: GameState, flow: Flow = IDLE): string[] => {
  const o = buildOverlays({
    state: s,
    flow,
    characterId: ID,
    reachable: reachablePlaces(s, ID),
    predicted: predictCreature(s),
    projection: PROJECTION,
    palette: MORNING,
  });
  return [...o.under, ...o.over].flatMap((n) => {
    const m = n.attrs['data-mark'];
    return typeof m === 'string' ? [m] : [];
  });
};

/** Day 1 with the character on a passable hex that leaves the window at the first tick. */
function standingAtTheEdge(): { start: GameState; hex: Hex } {
  const s = createGame(20261119, { characterIds: [ID] });
  const after = nextDay(s);
  const hex = windowHexes(s).find(
    (h) => !isCreatureHex(s, h) && isPassable(s, h) && !isInWindow(after, h),
  );
  if (!hex) throw new Error('no edge hex');
  return { start: at(s, hex), hex };
}

describe('the grace day', () => {
  it('day D: the hex is fading but in play; you can still move off it', () => {
    const { start, hex } = standingAtTheEdge();
    expect(['seen', 'unexplored']).toContain(cellStateAt(start, hexKey(hex)));
    expect(marks(start)).not.toContain('grace-warning');

    const dayD = nextDay(start);
    expect(cellStateAt(dayD, hexKey(hex))).toBe('fading');
    expect(me(dayD).status).toBe('active');
    expect(me(dayD).actionsLeft).toBe(dayD.config.actionsPerDay);
    // Readable: the tile is marked and your figure carries the warning.
    expect(marks(dayD)).toContain('grace');
    expect(marks(dayD)).toContain('grace-warning');

    // One more move is allowed: select yourself and step onto a hex still in the window.
    const selected = tap(IDLE, dayD, ID, { kind: 'me' });
    expect(selected).toEqual({ kind: 'selected' });
    const safe = reachablePlaces(dayD, ID).find(
      (r) => r.place.kind === 'creature' || isInWindow(dayD, r.place.hex),
    )!;
    const target = safe.place.kind === 'hex' ? safe.place.hex : dayD.creature.centre;
    const done = confirmMove(tapHex(selected, dayD, ID, target), dayD, ID);
    expect(me(done.state).at).not.toEqual(onHex(hex));
    const next = nextDay(done.state);
    expect(me(next).status).toBe('active');
    expect(cellStateAt(next, hexKey(hex))).toBe('lost');
  });

  it('staying on it through day D: lost at the next tick', () => {
    const { start, hex } = standingAtTheEdge();
    const dayD = nextDay(start);
    const after = nextDay(dayD);
    expect(cellStateAt(after, hexKey(hex))).toBe('lost');
    expect(me(after).status).toBe('lost');
    expect(marks(after)).not.toContain('grace-warning');
  });
});
