/**
 * HAND-WRITTEN FIXTURES: REPLACE with the worker's captured contract fixtures once they exist
 * (`docs/design/m2-session.md`: fixtures are captured from the real Worker and never edited by hand).
 *
 * They follow the contract plus the open proposals (offers, character identity, `you.admin`). The game
 * part is built with the core from a fixed seed, then the seed is dropped and terrain added to each known
 * tile, as the server's player view does.
 */
import {
  createGame,
  type GameState,
  type Hex,
  nextDay,
  onHex,
  terrainIdAt,
} from '@behemoth-road/core';
import type { AppConfig, Offer, PlayerView, Session } from './schema.ts';

const SEED = 20261119;

export const CONFIG: AppConfig = {
  environment: 'staging',
  version: 'dev',
  branch: 'm2/web',
  discordClientId: '000000000000000000',
  devTools: true,
};

export const SESSION: Session = {
  token: 'fixture-token',
  accessToken: 'fixture-access',
  user: { id: '100000000000000001', name: 'Misa' },
};

export const OFFERS: Offer[] = [
  { name: 'Aino Vasara', trait: 'keen-eyed', quirk: 'sleepwalker' },
  { name: 'Brann Holt', trait: 'sure-footed', quirk: 'hoarder' },
  { name: 'Ceri Lume', trait: 'patient', quirk: 'night-owl' },
  { name: 'Wanderer', trait: null, quirk: null },
];

const IDENTITY: Readonly<
  Record<string, { name: string; trait: string | null; quirk: string | null }>
> = {
  'c-misa': { name: 'Aino Vasara', trait: 'keen-eyed', quirk: 'sleepwalker' },
  'c-pip': { name: 'Pip Marrow', trait: 'strong', quirk: 'chatterbox' },
  'c-ola': { name: 'Ola Reed', trait: null, quirk: null },
};

/** The game part of a view: the state without its seed, known tiles with their terrain. */
export function stateView(state: GameState): PlayerView['game'] {
  const tiles: Record<string, PlayerView['game']['tiles'][string]> = {};
  for (const [key, tile] of Object.entries(state.tiles)) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    tiles[key] = { ...tile, terrain: terrainIdAt(state.seed, { q, r }) };
  }
  return {
    day: state.day,
    config: state.config,
    creature: state.creature,
    tiles,
    characters: state.characters.map((c) => ({ ...c, ...IDENTITY[c.id] })),
  };
}

function view(
  state: GameState,
  characterId: string | null,
  players: PlayerView['players'],
  offers: Offer[] | null,
  version: number,
): PlayerView {
  return {
    version,
    day: state.day,
    you: { userId: SESSION.user.id, characterId, admin: true },
    game: stateView(state),
    players,
    devTools: true,
    offers,
  };
}

const MISA = { userId: SESSION.user.id, name: 'Misa', joinedDay: 1 };
const PIP = {
  userId: '100000000000000002',
  name: 'Pip',
  characterId: 'c-pip',
  role: 'keeper',
  joinedDay: 1,
};
const OLA = {
  userId: '100000000000000003',
  name: 'Ola',
  characterId: 'c-ola',
  role: 'envoy',
  joinedDay: 1,
};

/** Before joining: someone else rides the creature; you have offers to pick from. */
export function notJoined(): PlayerView {
  const state = createGame(SEED, { characterIds: ['c-pip'] });
  return view(
    state,
    null,
    [{ ...MISA, characterId: null, role: null, joinedDay: null }, PIP],
    OFFERS,
    3,
  );
}

/** Joined: you and Pip ride the creature, Ola stands on a hex beside it. */
export function joined(): PlayerView {
  const base = createGame(SEED, { characterIds: ['c-misa', 'c-pip', 'c-ola'] });
  const beside: Hex = { q: base.creature.centre.q, r: base.creature.centre.r + 2 };
  const state: GameState = {
    ...base,
    characters: base.characters.map((c) => (c.id === 'c-ola' ? { ...c, at: onHex(beside) } : c)),
  };
  return view(
    state,
    'c-misa',
    [{ ...MISA, characterId: 'c-misa', role: 'scout' }, PIP, OLA],
    null,
    7,
  );
}

/** Your character was left behind and is lost; you may replace it. */
export function lost(): PlayerView {
  const base = createGame(SEED, { characterIds: ['c-misa', 'c-pip'] });
  const behind: Hex = { q: base.creature.centre.q, r: base.creature.centre.r + 4 };
  let state: GameState = {
    ...base,
    characters: base.characters.map((c) => (c.id === 'c-misa' ? { ...c, at: onHex(behind) } : c)),
  };
  for (let i = 0; i < 4; i += 1) state = nextDay(state);
  return view(
    state,
    'c-misa',
    [{ ...MISA, characterId: 'c-misa', role: 'scout' }, PIP],
    OFFERS,
    12,
  );
}
