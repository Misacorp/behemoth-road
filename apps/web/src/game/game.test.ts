import { describe, expect, it } from 'vitest';
import { joined, lost, notJoined } from '../api/fixtures.ts';
import { IDLE, openCharacter, tap } from '../map/flow.ts';
import { characterNeed, showsNextDay } from './Game.tsx';
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

  it('knows everyone: names, roles, traits, quirks and stable accents', () => {
    const ids = identities(joined());
    const pip = ids.get('c-pip')!;
    expect(pip).toMatchObject({ name: 'Pip Marrow', role: 'keeper', player: 'Pip' });
    expect(pip.accent).toBe(accentForName('Pip Marrow'));
    expect(ids.get('c-ola')).toMatchObject({ trait: null, quirk: null, role: 'envoy' });
  });

  it("reads terrain from the view's tiles, with no seed", () => {
    const v = joined();
    const state = toGameState(v.game);
    const [key, tile] = Object.entries(v.game.tiles)[0]!;
    expect((state.tiles[key] as { terrain?: string }).terrain).toBe(tile.terrain);
    expect(state.seed).toBe(0);
  });

  it("tapping another player's figure opens their card; again closes it", () => {
    const state = toGameState(joined().game);
    const card = tap(IDLE, state, 'c-misa', { kind: 'character', id: 'c-ola' });
    expect(card).toEqual(openCharacter('c-ola'));
    expect(tap(card, state, 'c-misa', { kind: 'character', id: 'c-ola' })).toEqual(IDLE);
  });

  it('before joining, tapping the creature opens the bubble without selecting anyone', () => {
    const state = toGameState(notJoined().game);
    const t = tap(IDLE, state, '', { kind: 'hex', hex: state.creature.centre });
    expect(t).toEqual({ kind: 'bubble', selecting: false });
  });
});
