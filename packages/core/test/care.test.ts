import { describe, expect, it } from 'vitest';
import {
  act,
  actionsHere,
  checkAction,
  chooseCreatureStep,
  createGame,
  creatureSigns,
  type GameState,
  hex,
  type Hex,
  nextDay,
  nextDayWithEvents,
  predictCreature,
  type Reaction,
  stepWeights,
  toPlayerView,
} from '../src/index.ts';
import { chainGame, placeCharacter, withTerrain } from './helpers.ts';

/** Keeper and scout riding a creature at the origin heading north, on plains. */
const base = (seed = 1): GameState => chainGame(['keeper', 'scout'], seed);

const withNature = (s: GameState, fire?: Reaction): GameState => ({
  ...s,
  nature: { ...s.nature, reactions: fire ? { fire } : {} },
});
const withSatiety = (s: GameState, satiety: number): GameState => ({
  ...s,
  care: { ...s.care, satiety },
});
const withFire = (s: GameState, h: Hex): GameState => ({
  ...s,
  stimuli: [...s.stimuli, { type: 'fire', hex: h, litDay: s.day }],
});
const giveTimber = (s: GameState, id: string): GameState => ({
  ...s,
  characters: s.characters.map((c) => (c.id === id ? { ...c, pack: { timber: 1 } } : c)),
});
const ok = (r: ReturnType<typeof act>): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

/** Left (nw) ends closer, straight the same, right (ne) farther. */
const LEFT_FIRE = hex(-2, 0);

describe('the hidden nature', () => {
  it('is rolled from the seed: a tame Mossback, attracted or repelled by fire, starting fed', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const a = createGame(seed);
      expect(createGame(seed).nature).toEqual(a.nature);
      expect(a.nature.type).toBe('mossback');
      seen.add(a.nature.reactions.fire ?? 'none');
      expect(a.care).toEqual({ satiety: 6, cues: { day: 1, list: [] } });
    }
    expect([...seen].sort()).toEqual(['attracted', 'repelled']);
  });

  it('never leaves the server', () => {
    let state = withFire(withSatiety(base(), 2), LEFT_FIRE);
    state = nextDay(state);
    expect(state.care.cues.list).toHaveLength(1);
    const view0 = JSON.parse(JSON.stringify(toPlayerView(state))) as Record<string, unknown>;
    expect(Object.keys(view0).sort()).toEqual([
      'artSeed',
      'characters',
      'config',
      'contentVersion',
      'creature',
      'day',
      'features',
      'misleadUntilDay',
      'peril',
      'project',
      'season',
      'settlements',
      'stimuli',
      'stores',
      'threats',
      'tiles',
      'unlocks',
    ]);
    expect(Object.keys(view0.creature as object).sort()).toEqual([
      'centre',
      'defenders',
      'heading',
      'lingeredDay',
      'lingering',
      'steps',
    ]);
    const view = toPlayerView(withFire(state, LEFT_FIRE));
    expect(view.stimuli).toEqual([{ type: 'fire', hex: LEFT_FIRE, litDay: state.day }]);
    expect(view.creature).toMatchObject({ lingering: false, lingeredDay: null });
  });
});

describe('step weights', () => {
  it('are the base weights with no stimulus in range, and the prediction never changes', () => {
    const state = withNature(base(), 'attracted');
    expect(stepWeights(state)).toEqual({ left: 1, straight: 2, right: 1 });
    expect(stepWeights(withFire(state, hex(-4, 0)))).toEqual({ left: 1, straight: 2, right: 1 });
    expect(predictCreature(withFire(state, LEFT_FIRE))).toEqual(predictCreature(state));
  });

  it('pull toward a fire, push away from it, or ignore it, by the reaction', () => {
    const attracted = stepWeights(withFire(withNature(base(), 'attracted'), LEFT_FIRE));
    expect(attracted).toEqual({ left: 6, straight: 2, right: 1 / 6 });
    // The contract's example: left about three times in four, right almost never.
    expect(attracted.left / (attracted.left + attracted.straight + attracted.right)).toBeCloseTo(
      0.73,
      2,
    );
    expect(stepWeights(withFire(withNature(base(), 'repelled'), LEFT_FIRE))).toEqual({
      left: 1 / 6,
      straight: 2,
      right: 6,
    });
    expect(stepWeights(withFire(withNature(base(), 'indifferent'), LEFT_FIRE))).toEqual({
      left: 1,
      straight: 2,
      right: 1,
    });
    // An unknown tag is indifference too.
    expect(stepWeights(withFire(withNature(base()), LEFT_FIRE)).left).toBe(1);
  });

  it('add up over several fires', () => {
    const both = withFire(withFire(withNature(base(), 'attracted'), LEFT_FIRE), hex(2, -2));
    expect(stepWeights(both)).toEqual({ left: 1, straight: 2, right: 1 });
    const twice = withFire(withFire(withNature(base(), 'attracted'), LEFT_FIRE), hex(-3, 0));
    expect(stepWeights(twice)).toEqual({ left: 36, straight: 2, right: 1 / 36 });
  });

  it('turn erratic when underfed and weaker when overfed', () => {
    const lit = withFire(withNature(base(), 'attracted'), LEFT_FIRE);
    expect(stepWeights(withSatiety(lit, 3))).toEqual({ left: 6, straight: 1, right: 1 / 6 });
    expect(stepWeights(withSatiety(base(), 0))).toEqual({ left: 1, straight: 1, right: 1 });
    // Overfed level 1: pull 1 + 5/2; level 3: 1 + 5/4.
    expect(stepWeights(withSatiety(lit, 8))).toEqual({ left: 3.5, straight: 2, right: 1 / 3.5 });
    expect(stepWeights(withSatiety(lit, 10))).toEqual({ left: 2.25, straight: 2, right: 1 / 2.25 });
    expect(stepWeights(withSatiety(lit, 7))).toEqual({ left: 6, straight: 2, right: 1 / 6 });
  });

  it('drive the real step', () => {
    let left = 0;
    const n = 400;
    for (let seed = 0; seed < n; seed++) {
      const state = withFire(withNature(createGame(seed), 'attracted'), LEFT_FIRE);
      if (chooseCreatureStep(state).direction === 'nw') left++;
    }
    expect(left / n).toBeGreaterThan(0.65);
    expect(left / n).toBeLessThan(0.81);
  });
});

describe('signs', () => {
  const signs = (satiety: number, viewer: string | null) =>
    creatureSigns(withSatiety(base(), satiety), viewer).appetite;

  it('show the appetite to a keeper from level 1, to others faintly from level 2', () => {
    expect(signs(6, 'keeper')).toBeNull();
    expect(signs(4, 'keeper')).toBeNull();
    expect(signs(7, 'keeper')).toBeNull();
    expect(signs(3, 'keeper')).toEqual({ kind: 'underfed', level: 1, faint: false });
    expect(signs(2, 'keeper')).toEqual({ kind: 'underfed', level: 2, faint: false });
    expect(signs(1, 'keeper')).toEqual({ kind: 'underfed', level: 3, faint: false });
    expect(signs(0, 'keeper')).toEqual({ kind: 'underfed', level: 3, faint: false });
    expect(signs(8, 'keeper')).toEqual({ kind: 'overfed', level: 1, faint: false });
    expect(signs(9, 'keeper')).toEqual({ kind: 'overfed', level: 2, faint: false });
    expect(signs(10, 'keeper')).toEqual({ kind: 'overfed', level: 3, faint: false });
    expect(signs(3, 'scout')).toBeNull();
    expect(signs(8, null)).toBeNull();
    expect(signs(2, 'scout')).toEqual({ kind: 'underfed', level: 1, faint: true });
    expect(signs(10, null)).toEqual({ kind: 'overfed', level: 1, faint: true });
  });

  it("show a keeper the day's reaction cues, and nobody else", () => {
    const lit = withFire(withFire(withNature(base(), 'repelled'), LEFT_FIRE), hex(0, -5));
    const next = nextDay(lit);
    expect(creatureSigns(next, 'keeper').cues).toEqual([
      { hex: LEFT_FIRE, stimulus: 'fire', reaction: 'away' },
    ]);
    expect(creatureSigns(next, 'scout').cues).toEqual([]);
    expect(creatureSigns(next, null).cues).toEqual([]);
    const lost = {
      ...next,
      characters: next.characters.map((c) => ({ ...c, status: 'lost' as const })),
    };
    expect(creatureSigns(lost, 'keeper').cues).toEqual([]);
    expect(creatureSigns(nextDay(next), 'keeper').cues).toEqual([]);
    const toward = nextDay(withFire(withNature(base(), 'attracted'), LEFT_FIRE));
    expect(creatureSigns(toward, 'keeper').cues[0]?.reaction).toBe('toward');
    const unmoved = nextDay(withFire(withNature(base(), 'indifferent'), LEFT_FIRE));
    expect(creatureSigns(unmoved, 'keeper').cues[0]?.reaction).toBe('unmoved');
  });
});

describe('lighting a fire', () => {
  const standing = (s: GameState = base()) => placeCharacter(s, 'scout', LEFT_FIRE);

  it('is refused on the creature, on water, where one burns, without fuel or actions', () => {
    const fire = { kind: 'light-fire' } as const;
    expect(checkAction(giveTimber(base(), 'scout'), 'scout', fire)).toEqual({
      ok: false,
      reason: 'on-creature',
      cost: 1,
    });
    expect(checkAction(standing(), 'scout', fire)).toEqual({
      ok: false,
      reason: 'no-fuel',
      cost: 1,
      missing: [{ material: 'timber', amount: 1 }],
    });
    const wet = withTerrain(giveTimber(standing(), 'scout'), LEFT_FIRE, 'river');
    expect(checkAction(wet, 'scout', fire)).toEqual({ ok: false, reason: 'cannot-burn', cost: 1 });
    const burning = withFire(giveTimber(standing(), 'scout'), LEFT_FIRE);
    expect(checkAction(burning, 'scout', fire)).toEqual({
      ok: false,
      reason: 'fire-here',
      cost: 1,
    });
    const tired = giveTimber(standing(), 'scout');
    const spent = {
      ...tired,
      characters: tired.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(checkAction(spent, 'scout', fire)).toEqual({
      ok: false,
      reason: 'not-enough-actions',
      cost: 1,
    });
  });

  it('burns one timber from the pack and lights a public fire that lasts one tick', () => {
    const state = giveTimber(standing(), 'scout');
    expect(checkAction(state, 'scout', { kind: 'light-fire' })).toEqual({
      ok: true,
      cost: 1,
      uses: [{ material: 'timber', amount: 1 }],
      chance: 1,
    });
    const r = act(state, 'scout', { kind: 'light-fire' });
    const lit = ok(r);
    expect(r.ok && r.events).toEqual([
      { kind: 'fire-lit', hex: LEFT_FIRE, characterId: 'scout', stimulus: 'fire' },
    ]);
    const scout = lit.characters.find((c) => c.id === 'scout')!;
    expect(scout.pack).toEqual({});
    expect(scout.actionsLeft).toBe(2);
    expect(lit.stimuli).toEqual([{ type: 'fire', hex: LEFT_FIRE, litDay: 1 }]);
    expect(nextDay(lit).stimuli).toEqual([]);
  });
});

describe('feeding', () => {
  it('needs the feeder riding and food in the stores', () => {
    const feed = { kind: 'feed' } as const;
    expect(checkAction(base(), 'scout', feed)).toEqual({
      ok: false,
      reason: 'no-food',
      cost: 1,
      missing: [{ material: 'forage', amount: 1 }],
    });
    const stocked: GameState = { ...base(), stores: { forage: 1 } };
    expect(checkAction(placeCharacter(stocked, 'scout', LEFT_FIRE), 'scout', feed)).toEqual({
      ok: false,
      reason: 'not-riding',
      cost: 1,
    });
    expect(checkAction(stocked, 'scout', feed)).toMatchObject({
      ok: true,
      cost: 1,
      uses: [{ material: 'forage', amount: 1 }],
    });
  });

  it('adds the food’s nourishment to satiety, capped, and anyone can do it', () => {
    const stocked: GameState = { ...base(), stores: { forage: 2, timber: 1 } };
    const r = act(stocked, 'scout', { kind: 'feed' });
    const fed = ok(r);
    expect(r.ok && r.events).toEqual([{ kind: 'fed', characterId: 'scout', material: 'forage' }]);
    expect(fed.care.satiety).toBe(8);
    expect(fed.stores).toEqual({ forage: 1, timber: 1 });
    expect(ok(act(withSatiety(stocked, 9), 'keeper', { kind: 'feed' })).care.satiety).toBe(10);
  });
});

describe('lingering', () => {
  it('is for keepers riding, once, and not the day after', () => {
    const linger = { kind: 'linger' } as const;
    expect(checkAction(base(), 'scout', linger)).toEqual({
      ok: false,
      reason: 'needs-keeper',
      cost: 2,
    });
    expect(checkAction(placeCharacter(base(), 'keeper', LEFT_FIRE), 'keeper', linger)).toEqual({
      ok: false,
      reason: 'not-riding',
      cost: 2,
    });
    expect(checkAction(base(), 'keeper', linger)).toMatchObject({ ok: true, cost: 2 });
    const r = act(base(), 'keeper', linger);
    const lingering = ok(r);
    expect(r.ok && r.events).toEqual([{ kind: 'linger', characterId: 'keeper' }]);
    expect(lingering.creature.lingering).toBe(true);
    expect(lingering.characters.find((c) => c.id === 'keeper')?.actionsLeft).toBe(1);
    expect(checkAction(lingering, 'keeper', linger)).toEqual({
      ok: false,
      reason: 'already-have',
      cost: 2,
    });
  });

  it('keeps the creature put for one tick, while the day still turns', () => {
    const start = withFire({ ...base(), stores: { forage: 1 } }, LEFT_FIRE);
    const lingering = ok(act(start, 'keeper', { kind: 'linger' }));
    expect(predictCreature(lingering)).toEqual([
      { direction: 'n', centre: hex(0, 0), chance: 1, stay: true },
    ]);
    const day2 = nextDay(lingering);
    expect(day2.day).toBe(2);
    expect(day2.creature).toMatchObject({ centre: hex(0, 0), lingering: false, lingeredDay: 1 });
    expect(day2.stimuli).toEqual([]);
    expect(day2.care.satiety).toBe(5);
    expect(day2.characters.every((c) => c.actionsLeft === 3)).toBe(true);
    expect(checkAction(day2, 'keeper', { kind: 'linger' })).toEqual({
      ok: false,
      reason: 'lingered-yesterday',
      cost: 2,
    });
    const day3 = nextDay(day2);
    expect(day3.creature.centre).not.toEqual(hex(0, 0));
    expect(checkAction(day3, 'keeper', { kind: 'linger' })).toMatchObject({ ok: true });
  });

  it('is offered among the actions here, with the fire and the feeding', () => {
    const kinds = actionsHere(base(), 'keeper').map((a) => a.action.kind);
    expect(kinds).toEqual(expect.arrayContaining(['light-fire', 'feed', 'linger']));
  });
});

describe('the tick', () => {
  it('drains hunger by one on every second tick (into even days), down to zero', () => {
    const days = [base()];
    for (let i = 0; i < 4; i++) days.push(nextDay(days.at(-1)!));
    expect(days.map((s) => s.care.satiety)).toEqual([6, 5, 5, 4, 4]);
    expect(nextDay(withSatiety(base(), 0)).care.satiety).toBe(0);
  });

  it('records cues only for fires within range', () => {
    const lit = withFire(withFire(withNature(base(), 'attracted'), LEFT_FIRE), hex(4, -4));
    const next = nextDay(lit);
    expect(next.care.cues).toEqual({
      day: 2,
      list: [{ hex: LEFT_FIRE, stimulus: 'fire', reaction: 'attracted' }],
    });
  });

  it('lets a starving creature eat from the stores: food first', () => {
    const stocked: GameState = { ...base(), stores: { iron: 2, forage: 1 } };
    // 2 drops to 1: underfed level 3, so it eats a forage (+2).
    const ate = nextDay(withSatiety(stocked, 2));
    expect(ate.stores).toEqual({ iron: 2 });
    expect(ate.care.satiety).toBe(3);
    // 3 drops to 2: level 2, it does not eat.
    expect(nextDay(withSatiety(stocked, 3)).stores).toEqual(stocked.stores);
  });

  it('lets a starving creature eat something else when there is no food, by a seeded pick', () => {
    const stocked: GameState = withSatiety({ ...base(), stores: { iron: 1, timber: 1 } }, 1);
    const ate = nextDay(stocked);
    expect(Object.values(ate.stores).reduce((a, b) => a + b, 0)).toBe(1);
    expect(ate.care.satiety).toBe(0);
    expect(nextDay(stocked)).toEqual(ate);
    const eaten = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const s = withSatiety({ ...chainGame(['keeper'], seed), stores: { iron: 1, timber: 1 } }, 1);
      eaten.add(Object.keys(nextDay(s).stores).join());
    }
    expect([...eaten].sort()).toEqual(['iron', 'timber']);
  });

  it('reports public events only: a lingered step, what a starving creature ate, fires out', () => {
    let state = withFire(withSatiety({ ...base(), stores: { forage: 1 } }, 2), LEFT_FIRE);
    state = ok(act(state, 'keeper', { kind: 'linger' }));
    const { events } = nextDayWithEvents(state);
    expect(events).toEqual([
      { kind: 'creature-step', from: hex(0, 0), to: hex(0, 0) },
      { kind: 'creature-ate', material: 'forage' },
      { kind: 'fire-out', hex: LEFT_FIRE, stimulus: 'fire' },
      { kind: 'day', day: 2 },
    ]);
    const json = JSON.stringify(events);
    for (const word of ['attracted', 'repelled', 'indifferent', 'satiety', 'cues', 'reaction']) {
      expect(json).not.toContain(word);
    }
    // Nothing eaten, nothing burning: neither event.
    const kinds = nextDayWithEvents(base()).events.map((e) => e.kind);
    expect(kinds).toEqual(['creature-step', 'day']);
  });
});
