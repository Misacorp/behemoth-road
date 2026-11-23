import { describe, expect, it } from 'vitest';
import {
  act,
  checkAction,
  createGame,
  creatureHexes,
  creatureSigns,
  type GameState,
  type Hex,
  hex,
  hexEquals,
  hexesInRange,
  DIRECTIONS,
  neighbour,
  nextDay,
  type Reaction,
  rotate,
  sideOf,
  stepWeights,
  stimulusPush,
  chooseCreatureStep,
} from '../src/index.ts';
import { chainGame, findSeed, placeCharacter } from './helpers.ts';

/**
 * Milestone 4's done criterion: a keeper works out by experiment how the
 * creature reacts to fire, and the team uses that to turn it. The keeper lights
 * one fire on the left, reads the cue the next day, then lights a fire each day
 * on whichever side bends the creature left (the near side if it is drawn to
 * fire, the far side if fire drives it off). A rider keeps it fed. The creature
 * heads north, so its sideways drift is its q coordinate (left is lower).
 *
 * The keeper is put on the fire's hex each day instead of walking there: walking
 * is proven elsewhere, and the spot is always within three hexes of the creature.
 */

const DAYS = 12;

/** A hex within fire range on the `side` of the creature's heading, where the keeper could light a fire. */
const fireSpot = (state: GameState, side: 'left' | 'right'): Hex | null => {
  const { centre } = state.creature;
  const footprint = creatureHexes(state);
  for (const h of hexesInRange(centre, state.config.stimulusRange)) {
    if (footprint.some((f) => hexEquals(f, h))) continue;
    if (sideOf(state, h) !== (side === 'left' ? 1 : -1)) continue;
    const there = withTimber(placeCharacter(state, 'keeper', h));
    if (checkAction(there, 'keeper', { kind: 'light-fire' }).ok) return h;
  }
  return null;
};

const withTimber = (state: GameState): GameState => ({
  ...state,
  characters: state.characters.map((c) => (c.id === 'keeper' ? { ...c, pack: { timber: 1 } } : c)),
});

/** The keeper lights a fire on `side` (its timber gathered off screen). */
const lightOn = (state: GameState, side: 'left' | 'right'): GameState => {
  const spot = fireSpot(state, side);
  if (!spot) throw new Error(`no spot for a fire on the ${side} on day ${state.day}`);
  const r = act(withTimber(placeCharacter(state, 'keeper', spot)), 'keeper', {
    kind: 'light-fire',
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

/** The rider feeds every fourth day (3, 7, 11...): hunger drains 1 a day and forage gives 4, so it stays comfortable (8 to 15 of 20). */
const feedIfDue = (state: GameState): GameState => {
  if (state.day % 4 !== 3) return state;
  const r = act(state, 'rider', { kind: 'feed' });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

const start = (seed: number): GameState => ({
  ...chainGame(['keeper', 'rider'], seed),
  stores: { forage: DAYS },
});

/** Plays the days, steering with fires if `steer`; returns the end state and the cue read. */
const play = (seed: number, steer: boolean) => {
  let state = start(seed);
  let gesture: string | undefined;
  for (let i = 0; i < DAYS; i++) {
    state = feedIfDue(state);
    if (steer) {
      if (state.day === 1) state = lightOn(state, 'left');
      else {
        gesture ??= creatureSigns(state, 'keeper').cues[0]?.reaction;
        state = lightOn(state, gesture === 'toward' ? 'left' : 'right');
      }
    }
    const comfortable = state.care.satiety >= 8 && state.care.satiety <= 15;
    expect(comfortable).toBe(true);
    state = nextDay(state);
  }
  return { state, gesture };
};

const seedWith = (reaction: Reaction) =>
  findSeed((seed) => createGame(seed).nature.reactions.fire === reaction);

describe('steering the creature with fire', () => {
  it.each([
    ['attracted', 'toward'],
    ['repelled', 'away'],
  ] as const)('works for a creature %s by fire', (reaction, expected) => {
    const seed = seedWith(reaction);

    // Day 2: the keeper reads the cue from yesterday's fire; the rider sees none.
    const day2 = nextDay(lightOn(start(seed), 'left'));
    expect(creatureSigns(day2, 'keeper').cues).toHaveLength(1);
    expect(creatureSigns(day2, 'keeper').cues[0]?.reaction).toBe(expected);
    expect(creatureSigns(day2, 'rider').cues).toEqual([]);

    const steered = play(seed, true);
    const free = play(seed, false);
    expect(steered.gesture).toBe(expected);
    // Measurably to the left of where the same days take it without fires.
    const drift = steered.state.creature.centre.q - free.state.creature.centre.q;
    expect(drift).toBeLessThanOrEqual(-4);
  });
});

describe('several fires at once', () => {
  // The creature at the origin heading north on plains: left is lower q, right higher.
  const AHEAD = hex(0, -2);
  const BEHIND = hex(0, 2);
  const LEFT = hex(-2, 0);
  const LEFT_FAR = hex(-3, 1);
  const LEFT_AHEAD = hex(-1, -2);
  const RIGHT = hex(2, -2);
  const RIGHT_FAR = hex(3, -2);
  const BASE = { left: 1, straight: 2, right: 1 };
  const PULL = 6;

  const game = (reaction: Reaction, fires: readonly Hex[], satiety = 12): GameState => {
    const state = chainGame(['keeper'], 1);
    return {
      ...state,
      nature: { ...state.nature, reactions: { fire: reaction } },
      care: { ...state.care, satiety },
      stimuli: fires.map((hexOfFire) => ({ type: 'fire', hex: hexOfFire, litDay: state.day })),
    };
  };

  it('tells the side of every heading: left, right, or on its line', () => {
    const state = chainGame(['keeper'], 1);
    for (const heading of DIRECTIONS) {
      const turned: GameState = { ...state, creature: { ...state.creature, heading } };
      const from = (steps: number, distance: number): Hex => {
        let h = turned.creature.centre;
        for (let i = 0; i < distance; i++) h = neighbour(h, rotate(heading, steps));
        return h;
      };
      for (const distance of [1, 2, 3]) {
        expect(sideOf(turned, from(-2, distance))).toBe(1);
        expect(sideOf(turned, from(2, distance))).toBe(-1);
        expect(sideOf(turned, from(-1, distance))).toBe(1);
        expect(sideOf(turned, from(1, distance))).toBe(-1);
        expect(sideOf(turned, from(0, distance))).toBe(0);
        expect(sideOf(turned, from(3, distance))).toBe(0);
      }
    }
  });

  it('one fire: an attracted creature turns toward its side, a repelled one away', () => {
    expect(stimulusPush(game('attracted', [LEFT]))).toBe(1);
    expect(stimulusPush(game('attracted', [RIGHT]))).toBe(-1);
    expect(stimulusPush(game('repelled', [LEFT]))).toBe(-1);
    expect(stimulusPush(game('repelled', [RIGHT]))).toBe(1);
    expect(stepWeights(game('attracted', [LEFT]))).toEqual({
      left: PULL,
      straight: 2,
      right: 1 / PULL,
    });
    expect(stepWeights(game('repelled', [LEFT]))).toEqual({
      left: 1 / PULL,
      straight: 2,
      right: PULL,
    });
    expect(stepWeights(game('attracted', [RIGHT]))).toEqual({
      left: 1 / PULL,
      straight: 2,
      right: PULL,
    });
  });

  it('a fire is only a sideways push: the straight weight never changes', () => {
    for (const reaction of ['attracted', 'repelled', 'indifferent'] as const) {
      for (const fires of [[LEFT], [RIGHT], [LEFT, LEFT_FAR, RIGHT], [AHEAD, BEHIND]]) {
        expect(stepWeights(game(reaction, fires)).straight).toBe(2);
      }
    }
  });

  it('fires on both sides cancel', () => {
    for (const reaction of ['attracted', 'repelled'] as const) {
      expect(stimulusPush(game(reaction, [LEFT, RIGHT]))).toBe(0);
      expect(stepWeights(game(reaction, [LEFT, RIGHT]))).toEqual(BASE);
      expect(stepWeights(game(reaction, [LEFT, LEFT_FAR, RIGHT, RIGHT_FAR]))).toEqual(BASE);
    }
  });

  it('several fires on one side add up, and the other side only takes away', () => {
    expect(stepWeights(game('attracted', [LEFT, LEFT_FAR]))).toEqual({
      left: PULL ** 2,
      straight: 2,
      right: 1 / PULL ** 2,
    });
    expect(stimulusPush(game('attracted', [LEFT, LEFT_FAR, LEFT_AHEAD]))).toBe(3);
    // Three on the left, one on the right: a net push of two, to the left.
    expect(stimulusPush(game('attracted', [LEFT, LEFT_FAR, LEFT_AHEAD, RIGHT]))).toBe(2);
    // A repelled creature is driven right by the same fires.
    expect(stimulusPush(game('repelled', [LEFT, LEFT_FAR, LEFT_AHEAD, RIGHT]))).toBe(-2);
    expect(stepWeights(game('repelled', [LEFT, LEFT_FAR, RIGHT]))).toEqual({
      left: 1 / PULL,
      straight: 2,
      right: PULL,
    });
  });

  it('a fire straight ahead or straight behind pushes neither way', () => {
    for (const reaction of ['attracted', 'repelled'] as const) {
      expect(stepWeights(game(reaction, [AHEAD]))).toEqual(BASE);
      expect(stepWeights(game(reaction, [BEHIND]))).toEqual(BASE);
      expect(stepWeights(game(reaction, [AHEAD, BEHIND]))).toEqual(BASE);
      // It does not disturb a push from the side either.
      expect(stepWeights(game(reaction, [AHEAD, LEFT])).left).toBe(
        stepWeights(game(reaction, [LEFT])).left,
      );
    }
  });

  it('an indifferent creature ignores every fire, and the keeper can still tell why', () => {
    expect(stepWeights(game('indifferent', [LEFT, LEFT_FAR, RIGHT]))).toEqual(BASE);
  });

  it('a fire out of range is ignored', () => {
    const state = game('attracted', [LEFT, hex(-4, 1)]);
    expect(stimulusPush(state)).toBe(1);
    expect(stimulusPush(game('attracted', [hex(-4, 1), hex(-4, 2)]))).toBe(0);
  });

  it('keeps the pull softer when overfed and the steps erratic when underfed', () => {
    const level1 = 1 + (PULL - 1) / 2;
    expect(stepWeights(game('attracted', [LEFT, LEFT_FAR], 16)).left).toBe(level1 ** 2);
    expect(stepWeights(game('attracted', [LEFT, RIGHT], 16))).toEqual(BASE);
    // Underfed: the hungry base weights (1 : 1 : 1) with the same push.
    expect(stepWeights(game('attracted', [LEFT], 6))).toEqual({
      left: PULL,
      straight: 1,
      right: 1 / PULL,
    });
  });

  it('never turns back, however many fires surround it', () => {
    const fires = [LEFT, LEFT_FAR, LEFT_AHEAD, RIGHT, RIGHT_FAR, AHEAD, BEHIND];
    const seen = new Set<string>();
    for (const reaction of ['attracted', 'repelled'] as const) {
      for (let day = 1; day <= 60; day++) {
        const state = { ...game(reaction, fires), day };
        seen.add(chooseCreatureStep(state).direction);
      }
    }
    expect([...seen].every((d) => ['nw', 'n', 'ne'].includes(d))).toBe(true);
  });

  it('turns the walk toward the side of the net push, nearly every day', () => {
    let left = 0;
    for (let day = 1; day <= 100; day++) {
      const state = { ...game('attracted', [LEFT, LEFT_FAR, LEFT_AHEAD, RIGHT]), day };
      if (chooseCreatureStep(state).direction === 'nw') left++;
    }
    expect(left).toBeGreaterThan(90);
  });

  it('the keeper cue names the reaction of every fire in range, whichever side it is on', () => {
    const state = game('attracted', [LEFT, AHEAD, RIGHT_FAR]);
    const next = nextDay(state);
    expect(creatureSigns(next, 'keeper').cues.map((c) => c.reaction)).toEqual([
      'toward',
      'toward',
      'toward',
    ]);
    const away = nextDay(game('repelled', [LEFT]));
    expect(creatureSigns(away, 'keeper').cues.map((c) => c.reaction)).toEqual(['away']);
  });
});
