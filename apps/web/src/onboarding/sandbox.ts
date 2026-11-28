/**
 * The practice map: a small game that runs entirely in the browser on the pure core, with a fixed seed. It
 * never touches the network and never mixes with the real game: no request is made, no socket is opened,
 * and nothing here is stored. Its seed and its hidden features are local to this file (it may show its own
 * hidden things, it is practice). Pure functions of a role: the same role always makes the same map.
 *
 * You stand a little way from the creature, with a revealed iron node and a revealed ruin beside you and a
 * veiled hex to look at. The guided first day (`coach.ts`) walks you through one move and one action of
 * your role on it.
 */
import {
  addCharacter,
  characterOf,
  createGame,
  creatureSigns,
  glintsFor,
  type GameState,
  type GameStateView,
  type Hex,
  onHex,
  toPlayerView,
} from '@behemoth-road/core';
import type { PlayerView } from '../api/schema.ts';

/** The practice map's seeds, fixed (the real game's seed is secret and never reaches the browser). */
export const SANDBOX_SEED = 20261124;
export const SANDBOX_ART_SEED = 777;

/** Discord-shaped ids (digits only, as the core wants) that belong to no real user. */
export const SANDBOX_USERS = {
  you: '900000000000000001',
  pip: '900000000000000002',
  ola: '900000000000000003',
} as const;

const NAMES: Readonly<Record<string, string>> = {
  [SANDBOX_USERS.you]: 'You',
  [SANDBOX_USERS.pip]: 'Pip',
  [SANDBOX_USERS.ola]: 'Ola',
};

/** Spots of the practice map, as offsets from the creature's centre. */
export const SPOTS = {
  /** Where you start (explored, plain ground). */
  start: { q: 1, r: 2 },
  /** A revealed iron node, one step away. */
  iron: { q: 1, r: 3 },
  /** A revealed ruin, one step away on the other side. */
  ruin: { q: 2, r: 2 },
  /** Where a scout walks to, beside the veiled hex (the iron, until it is looked at). */
  lookout: { q: 0, r: 3 },
} as const;

export type SpotName = keyof typeof SPOTS;

/** The practice party: you, Pip the keeper on the creature and Ola the engineer beside it. */
const COMPANIONS = [
  { userId: SANDBOX_USERS.pip, role: 'keeper' },
  { userId: SANDBOX_USERS.ola, role: 'engineer' },
] as const;

export const hexAt = (state: Pick<GameStateView, 'creature'>, spot: SpotName): Hex => ({
  q: state.creature.centre.q + SPOTS[spot].q,
  r: state.creature.centre.r + SPOTS[spot].r,
});

const must = (result: ReturnType<typeof addCharacter>): GameState => {
  if (!result.ok) throw new Error(`practice map: ${result.reason}`);
  return result.state;
};

/** A new practice map for `role`, with you on your start hex and the day at 1. */
export function sandboxState(role: string): GameState {
  let state = createGame(SANDBOX_SEED, { artSeed: SANDBOX_ART_SEED });
  for (const c of COMPANIONS) state = must(addCharacter(state, { ...c, offer: 0 }));
  state = must(addCharacter(state, { userId: SANDBOX_USERS.you, role, offer: 0 }));
  const centre = state.creature.centre;
  const abs = (h: Hex): Hex => ({ q: centre.q + h.q, r: centre.r + h.r });
  const key = (h: Hex): string => `${String(abs(h).q)},${String(abs(h).r)}`;
  // Plain ground around the spots, so nothing the seed made gets in the way.
  const tiles = { ...state.tiles };
  for (let dq = -1; dq <= 3; dq += 1) {
    for (let dr = 1; dr <= 5; dr += 1) {
      const k = key({ q: dq, r: dr });
      const known = tiles[k];
      if (known) tiles[k] = { ...known, terrain: (dq + dr) % 3 === 0 ? 'forest' : 'plains' };
    }
  }
  // The iron is veiled for a scout (who looks at it), revealed for everyone else; the ruin always is.
  const ironRevealed = role !== 'scout';
  for (const [spot, revealed] of [
    ['start', true],
    ['iron', ironRevealed],
    ['ruin', true],
    ['lookout', true],
  ] as const) {
    const known = tiles[key(SPOTS[spot])];
    // Open ground, so nothing hides the figures and the hexes that matter.
    if (known) tiles[key(SPOTS[spot])] = { ...known, terrain: 'plains', explored: revealed };
  }
  state = {
    ...state,
    tiles,
    features: {
      [key(SPOTS.iron)]: { type: 'iron-deposit', revealed: ironRevealed, left: 3 },
      [key(SPOTS.ruin)]: { type: 'tomb', revealed: true, left: 1 },
    },
    // A keeper feeds from the team's stores.
    stores: { forage: 2 },
    threats: [],
    settlements: [],
    peril: 0,
  };
  // Ola stands beside the creature; you stand on your start hex.
  const ola = abs({ q: 0, r: 2 });
  state = {
    ...state,
    characters: state.characters.map((c) =>
      c.userId === SANDBOX_USERS.you
        ? { ...c, at: onHex(abs(SPOTS.start)), pack: {} }
        : c.userId === SANDBOX_USERS.ola
          ? { ...c, at: onHex(ola) }
          : c,
    ),
  };
  return state;
}

/** The view of the practice map that `you` gets: no admin, no dev tools, no offers, a quiet record. */
export function sandboxView(state: GameState, version: number): PlayerView {
  const mine = characterOf(state, SANDBOX_USERS.you) ?? null;
  const active = mine?.status === 'active' ? mine.id : null;
  const users = Object.values(SANDBOX_USERS);
  return {
    version,
    day: state.day,
    pace: 'daily',
    fastTickAt: null,
    now: 0,
    you: {
      userId: SANDBOX_USERS.you,
      characterId: mine?.id ?? null,
      admin: false,
      seen: [],
      lastDay: null,
      lastVersion: null,
      storyRead: [],
    },
    offers: null,
    // The core's view type is read-only; the parsed type is the same shape.
    game: toPlayerView(state) as PlayerView['game'],
    ending: null,
    players: users.map((userId) => {
      const c = characterOf(state, userId) ?? null;
      return {
        userId,
        name: NAMES[userId] ?? 'Player',
        characterId: c?.id ?? null,
        role: c?.role ?? null,
        joinedDay: c?.joinedDay ?? null,
      };
    }),
    devTools: false,
    events: [],
    eventsTruncated: false,
    signs: creatureSigns(state, active) as PlayerView['signs'],
    glints: glintsFor(state, active),
  };
}
