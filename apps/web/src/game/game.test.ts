import { describe, expect, it } from 'vitest';
import { terrainOf } from '@behemoth-road/core';
import { characterIdOf, joined, lost, notJoined, USERS } from '../api/fixtures.ts';
import { IDLE, openCharacter, tap } from '../map/flow.ts';
import { characterNeed, halfDrawerCover, showsNextDay } from './Game.tsx';
import { accentForName, identities } from './identity.ts';
import { toGameState } from './viewState.ts';

describe('playing from the player view', () => {
  it('needs a character before joining and after being lost, not otherwise', () => {
    expect(characterNeed(notJoined())).toBe('join');
    expect(characterNeed(joined())).toBe('none');
    expect(characterNeed(lost())).toBe('replace');
  });

  it('shows next day only with dev tools and an admin', () => {
    const v = joined();
    expect(showsNextDay(v)).toBe(true);
    expect(showsNextDay({ ...v, devTools: false })).toBe(false);
    expect(showsNextDay({ ...v, you: { ...v.you, admin: false } })).toBe(false);
  });

  it('knows everyone: names, roles, traits, quirks, and looks that differ', () => {
    const v = joined();
    const ids = identities(v);
    const pip = ids.get(characterIdOf(v, USERS.PIP))!;
    const core = v.game.characters.find((c) => c.id === pip.id)!;
    expect(pip).toMatchObject({ name: core.name, role: 'keeper', player: 'Pip' });
    expect(pip.trait).toBe(core.trait);
    const looks = [...ids.values()].map(
      (w) => `${w.accent}|${w.look?.headwear}|${w.look?.garment}`,
    );
    expect(new Set(looks).size).toBe(looks.length);
    expect(accentForName('Ola')).toBe(accentForName('Ola'));
  });

  it("reads terrain from the view's tiles: the view has no seed", () => {
    const v = joined();
    expect(v.game).not.toHaveProperty('seed');
    const [key, tile] = Object.entries(v.game.tiles)[0]!;
    const [q, r] = key.split(',').map(Number) as [number, number];
    expect(terrainOf(toGameState(v.game), { q, r })?.id).toBe(tile.terrain);
    // Beyond the known tiles there is nothing to read.
    expect(terrainOf(toGameState(v.game), { q: 999, r: 999 })).toBeNull();
  });

  it("tapping another player's figure opens their card; again closes it", () => {
    const v = joined();
    const state = toGameState(v.game);
    const me = characterIdOf(v, USERS.MISA);
    const ola = characterIdOf(v, USERS.OLA);
    const card = tap(IDLE, state, me, { kind: 'character', id: ola });
    expect(card).toEqual(openCharacter(ola));
    expect(tap(card, state, me, { kind: 'character', id: ola })).toEqual(IDLE);
  });

  it('before joining, tapping the creature opens the bubble without selecting anyone', () => {
    const state = toGameState(notJoined().game);
    const t = tap(IDLE, state, '', { kind: 'hex', hex: state.creature.centre });
    expect(t).toEqual({ kind: 'bubble', selecting: false });
  });

  it('on phones the half drawer covers the bottom; on desktop it sits at the side', () => {
    expect(halfDrawerCover(390, 844)).toBeCloseTo(472.6, 1);
    expect(halfDrawerCover(390, 1200)).toBe(520);
    expect(halfDrawerCover(1440, 900)).toBe(0);
  });
});
