import {
  createGame,
  creatureEdge,
  type GameState,
  type Hex,
  isPassable,
  onHex,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { choose, entryKey, goBack, IDLE, pickEntries, tap } from './flow.ts';

const ME = 'you';
const PIP = 'pip';

/** Two characters and a swarm on one hex off the creature; `crowd` picks which of them stand there. */
const game = (
  crowd: { pip?: boolean; threat?: boolean } = { pip: true, threat: true },
): GameState => {
  const s = createGame(20261119, { characterIds: [ME, PIP] });
  const at: Hex = creatureEdge(s).find((h) => isPassable(s, h))!;
  const elsewhere: Hex = creatureEdge(s).filter((h) => isPassable(s, h))[2]!;
  return {
    ...s,
    characters: s.characters.map((c) => ({
      ...c,
      at: onHex(c.id === ME || (c.id === PIP && crowd.pip) ? at : elsewhere),
    })),
    threats: crowd.threat
      ? [{ id: 't1', type: 'swarm', hex: at, strength: 2, appearedDay: s.day }]
      : [],
  };
};
const hexOf = (s: GameState): Hex => {
  const at = s.characters.find((c) => c.id === ME)!.at;
  if (at.kind !== 'hex') throw new Error('hex');
  return at.hex;
};

describe('the tile picker', () => {
  it('lists your character, the others and the threat on a shared tile', () => {
    const s = game();
    expect(pickEntries(s, ME, hexOf(s)).map(entryKey)).toEqual([
      'me',
      `character:${PIP}`,
      'threat:t1',
    ]);
  });

  it('opens on a tap on the tile, on your figure, or on another figure there; the same tile again closes it', () => {
    const s = game();
    const pick = { kind: 'pick', hex: hexOf(s) };
    expect(tap(IDLE, s, ME, { kind: 'me' })).toEqual(pick);
    expect(tap(IDLE, s, ME, { kind: 'hex', hex: hexOf(s) })).toEqual(pick);
    expect(tap(IDLE, s, ME, { kind: 'character', id: PIP })).toEqual(pick);
    expect(tap({ kind: 'pick', hex: hexOf(s) }, s, ME, { kind: 'hex', hex: hexOf(s) })).toEqual(
      IDLE,
    );
  });

  it('skips the picker when a tile holds one thing: you alone select, a lone threat opens its card', () => {
    const alone = game({});
    expect(tap(IDLE, alone, ME, { kind: 'me' })).toEqual({ kind: 'selected' });
    // A threat alone on its tile (the others are elsewhere) opens its card straight away.
    const lone = game({ threat: true });
    const edge = creatureEdge(lone).filter((h) => isPassable(lone, h));
    const hex = edge[4]!;
    const apart: GameState = { ...lone, threats: lone.threats.map((t) => ({ ...t, hex })) };
    expect(pickEntries(apart, ME, hex).map(entryKey)).toEqual(['threat:t1']);
    expect(tap(IDLE, apart, ME, { kind: 'hex', hex })).toEqual({ kind: 'threat', id: 't1' });
  });

  it('opens the chosen thing, with a back to the picker', () => {
    const s = game();
    const pick = { kind: 'pick', hex: hexOf(s) } as const;
    const threat = choose(s, ME, pick, { kind: 'threat', id: 't1' });
    expect(threat).toEqual({ kind: 'threat', id: 't1', back: pick });
    expect(goBack(threat)).toEqual(pick);
    const who = choose(s, ME, pick, { kind: 'character', id: PIP });
    expect(who).toEqual({ kind: 'character', id: PIP, back: pick });
    expect(goBack(who)).toEqual(pick);
    expect(choose(s, ME, pick, { kind: 'me' })).toEqual({ kind: 'selected' });
  });

  it('closes when another tile is tapped (the new tap takes over)', () => {
    const s = game();
    const other = creatureEdge(s).find((h) => h.q !== hexOf(s).q || h.r !== hexOf(s).r)!;
    const next = tap({ kind: 'pick', hex: hexOf(s) }, s, ME, { kind: 'hex', hex: other });
    expect(next.kind).not.toBe('pick');
  });
});
