import { describe, expect, it } from 'vitest';
import {
  act,
  checkAction,
  createGame,
  creatureHexes,
  creatureSigns,
  type GameState,
  type Hex,
  hexDistance,
  hexEquals,
  hexesInRange,
  nextDay,
  predictCreature,
  type Reaction,
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

/**
 * A hex within fire range where the `side` step ends closer and the other side's
 * step farther, and the keeper could light a fire.
 */
const fireSpot = (state: GameState, side: 'left' | 'right'): Hex | null => {
  const [left, , right] = predictCreature(state);
  if (!left || !right) return null;
  const [near, far] = side === 'left' ? [left, right] : [right, left];
  const { centre } = state.creature;
  const footprint = creatureHexes(state);
  for (const h of hexesInRange(centre, state.config.stimulusRange)) {
    if (footprint.some((f) => hexEquals(f, h))) continue;
    const d = hexDistance(centre, h);
    if (!(hexDistance(near.centre, h) < d && hexDistance(far.centre, h) > d)) continue;
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

/** The rider feeds every other day, which keeps the creature comfortable (5 to 7). */
const feedIfDue = (state: GameState): GameState => {
  if (state.day % 2 !== 0) return state;
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
    const comfortable = state.care.satiety >= 4 && state.care.satiety <= 7;
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
