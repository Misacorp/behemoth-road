import { describe, expect, it } from 'vitest';
import {
  addCharacter,
  characterOffers,
  characterOf,
  createGame,
  type GameState,
  nextDay,
  ON_CREATURE,
  QUIRKS,
  replaceCharacter,
  ROLES,
  rollCharacters,
  TRAITS,
} from '../src/index.ts';

const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;

describe('content', () => {
  it('has the six roles', () => {
    expect(ROLES.map((r) => r.id)).toEqual([
      'scout',
      'scholar',
      'keeper',
      'guardian',
      'engineer',
      'envoy',
    ]);
    expect(ROLES.map((r) => r.name)).toEqual([
      'Scout',
      'Scholar',
      'Keeper',
      'Guardian',
      'Engineer',
      'Envoy',
    ]);
  });

  it('has about a dozen traits and quirks, each with an icon and tags', () => {
    for (const list of [TRAITS, QUIRKS]) {
      expect(list.length).toBeGreaterThanOrEqual(10);
      expect(unique(list.map((x) => x.id))).toBe(true);
      for (const x of list) expect(x.icon.length).toBeGreaterThan(0);
    }
    for (const t of TRAITS) expect(t.tags.length).toBeGreaterThan(0);
    // A quirk always cuts both ways.
    for (const q of QUIRKS) {
      expect(q.helps.length).toBeGreaterThan(0);
      expect(q.hinders.length).toBeGreaterThan(0);
    }
  });
});

describe('rollCharacters', () => {
  it('rolls two or three characters plus the plain one, the same every time', () => {
    const counts = new Set<number>();
    for (let attempt = 0; attempt < 20; attempt++) {
      const roll = rollCharacters(42, 'user-1', attempt);
      expect(rollCharacters(42, 'user-1', attempt)).toEqual(roll);
      counts.add(roll.length);
      const plain = roll.at(-1)!;
      expect(plain).toMatchObject({ trait: null, quirk: null });
      const rolled = roll.slice(0, -1);
      for (const c of rolled) {
        expect(TRAITS.some((t) => t.id === c.trait)).toBe(true);
        expect(QUIRKS.some((q) => q.id === c.quirk)).toBe(true);
      }
      expect(unique(rolled.map((c) => c.trait!))).toBe(true);
      expect(unique(rolled.map((c) => c.quirk!))).toBe(true);
      for (const c of roll) expect(c.name).toMatch(/^[A-Z][a-z]+( .+)?$/);
    }
    expect([...counts].sort()).toEqual([3, 4]);
  });

  it('gives each offer a look that stays with the character', () => {
    const state = createGame(8);
    const offers = characterOffers(state, '1001');
    expect(characterOffers(state, '1001')).toEqual(offers);
    for (const o of offers) {
      expect(Number.isInteger(o.lookSeed) && o.lookSeed >= 0 && o.lookSeed <= 0xffffffff).toBe(
        true,
      );
    }
    expect(new Set(offers.map((o) => o.lookSeed)).size).toBe(offers.length);
    for (const [i, offer] of offers.entries()) {
      const joined = join(state, '1001', i).state.characters[0]!;
      expect(joined.lookSeed).toBe(offer.lookSeed);
    }
  });

  it('differs by game, user and attempt', () => {
    const base = rollCharacters(42, 'user-1', 0);
    expect(rollCharacters(43, 'user-1', 0)).not.toEqual(base);
    expect(rollCharacters(42, 'user-2', 0)).not.toEqual(base);
    expect(rollCharacters(42, 'user-1', 1)).not.toEqual(base);
  });
});

const join = (state: GameState, userId: string, offer = 0, role = 'scout') => {
  const result = addCharacter(state, { userId, offer, role });
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe('addCharacter', () => {
  it('adds the chosen character, riding the creature, with the role', () => {
    const state = nextDay(createGame(3));
    const offers = characterOffers(state, '1001');
    const { state: next, characterId } = join(state, '1001', 1, 'keeper');
    const c = next.characters.find((x) => x.id === characterId)!;
    expect(c).toEqual({
      id: characterId,
      userId: '1001',
      ...offers[1],
      role: 'keeper',
      joinedDay: 2,
      at: ON_CREATURE,
      actionsLeft: 3,
      pack: {},
      status: 'active',
      struckDay: null,
    });
    expect(state.characters).toHaveLength(0);
    const plainIndex = offers.length - 1;
    const plain = join(state, '1001', plainIndex).state.characters[0]!;
    expect(plain).toMatchObject({ trait: null, quirk: null });
  });

  it('allows one character per user', () => {
    const { state } = join(createGame(3), '1001');
    expect(addCharacter(state, { userId: '1001', offer: 0, role: 'scout' })).toEqual({
      ok: false,
      reason: 'has-character',
    });
  });

  it('refuses unknown roles, offers and users', () => {
    const state = createGame(3);
    const ask = (userId: string, offer: number, role: string) =>
      addCharacter(state, { userId, offer, role });
    expect(ask('1001', 0, 'pathfinder')).toEqual({ ok: false, reason: 'unknown-role' });
    expect(ask('1001', 9, 'scout')).toEqual({ ok: false, reason: 'invalid-offer' });
    expect(ask('1001', -1, 'scout')).toEqual({ ok: false, reason: 'invalid-offer' });
    expect(ask('1001', 0.5, 'scout')).toEqual({ ok: false, reason: 'invalid-offer' });
    // Discord snowflakes only: digits, 1 to 20 of them.
    for (const bad of ['', 'abc', '12.3', '1 2', '-5', '1'.repeat(21), '１２３']) {
      expect(ask(bad, 0, 'scout')).toEqual({ ok: false, reason: 'invalid-user' });
    }
    expect(ask('1'.repeat(20), 0, 'scout').ok).toBe(true);
  });

  it('stops at the player cap of active characters', () => {
    let state = createGame(3, { config: { playerCap: 2 } });
    state = join(state, '1').state;
    state = join(state, '2').state;
    expect(addCharacter(state, { userId: '3', offer: 0, role: 'scout' })).toEqual({
      ok: false,
      reason: 'cap-reached',
    });
    expect(createGame(3).config.playerCap).toBe(15);
  });
});

describe('refusals', () => {
  it('leave the offers as they were', () => {
    const start = createGame(3, { config: { playerCap: 1 } });
    const { state } = join(start, '1');
    const before = characterOffers(state, '2');
    const refused = [
      addCharacter(state, { userId: '2', offer: 0, role: 'scout' }), // cap reached
      addCharacter(state, { userId: '2', offer: 0, role: 'nobody' }),
      addCharacter(state, { userId: '2', offer: 99, role: 'scout' }),
      replaceCharacter(state, { userId: '1', offer: 0, role: 'scout' }), // not lost
      replaceCharacter(state, { userId: '2', offer: 0, role: 'scout' }), // no character
    ];
    for (const r of refused) expect(r.ok).toBe(false);
    expect(characterOffers(state, '2')).toEqual(before);
    expect(characterOffers(state, '1')).toEqual(characterOffers(join(start, '1').state, '1'));
  });
});

describe('replaceCharacter', () => {
  const lose = (state: GameState, userId: string): GameState => ({
    ...state,
    characters: state.characters.map((c) =>
      c.userId === userId ? { ...c, status: 'lost', actionsLeft: 0 } : c,
    ),
  });

  it('only replaces a lost character, and keeps the lost one', () => {
    const start = createGame(3);
    const request = { userId: '1001', offer: 0, role: 'envoy' };
    expect(replaceCharacter(start, request)).toEqual({ ok: false, reason: 'no-character' });
    const joined = join(start, '1001').state;
    expect(replaceCharacter(joined, request)).toEqual({ ok: false, reason: 'not-lost' });

    const lost = lose(joined, '1001');
    const fresh = characterOffers(lost, '1001');
    expect(fresh).not.toEqual(characterOffers(start, '1001')); // a new attempt, new offers
    const result = replaceCharacter(lost, request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.characters).toHaveLength(2);
    expect(result.state.characters[0]?.status).toBe('lost');
    expect(characterOf(result.state, '1001')).toMatchObject({
      id: result.characterId,
      name: fresh[0]!.name,
      role: 'envoy',
      at: ON_CREATURE,
      status: 'active',
    });
    expect(result.characterId).not.toBe(joined.characters[0]!.id);
  });

  it('frees a place under the cap when a character is lost', () => {
    let state = createGame(3, { config: { playerCap: 1 } });
    state = join(state, '1').state;
    expect(addCharacter(state, { userId: '2', offer: 0, role: 'scout' })).toMatchObject({
      ok: false,
      reason: 'cap-reached',
    });
    state = lose(state, '1');
    expect(addCharacter(state, { userId: '2', offer: 0, role: 'scout' }).ok).toBe(true);
  });

  it('round-trips characters through JSON', () => {
    const { state } = join(createGame(3), '1001', 0, 'guardian');
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
