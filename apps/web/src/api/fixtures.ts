/**
 * Scenarios built with the core, for flow tests and the screenshot script's fake server (which needs a live
 * state to apply moves and ticks). Response parsing is checked against the Worker's captured fixtures
 * (`fixtures/*.json`, `contract.test.ts`), which are the contract's source of truth.
 *
 * They follow the contract. The game parts come from the core itself, as the server makes them: a seeded
 * game, players joining with `addCharacter` and the core's rolled offers, and `toPlayerView` to drop the
 * seed. The screenshot script runs the same scenarios as a fake server.
 */
import {
  addCharacter,
  characterOf,
  characterOffers,
  createGame,
  type GameState,
  type Hex,
  nextDay,
  onHex,
  replaceCharacter,
  toPlayerView,
} from '@behemoth-road/core';
import type { AppConfig, PlayerView, Session } from './schema.ts';

const SEED = 20261119;
const ART_SEED = 4242;

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

const MISA = SESSION.user.id;
const PIP = '100000000000000002';
const OLA = '100000000000000003';

/** Discord display names, by user id. */
const NAMES: Readonly<Record<string, string>> = { [MISA]: 'Misa', [PIP]: 'Pip', [OLA]: 'Ola' };

/** A scenario: the full state (with its seed, as the server holds it), whose view it is, and a version. */
export interface Scenario {
  readonly state: GameState;
  readonly you: string;
  readonly version: number;
  /** Admins see "next day" when dev tools are on. */
  readonly admin: boolean;
}

/** The view the server would send `scenario.you`. */
export function toView(s: Scenario): PlayerView {
  const mine = characterOf(s.state, s.you) ?? null;
  const needsCharacter = mine === null || mine.status === 'lost';
  const users = [...new Set([s.you, ...s.state.characters.map((c) => c.userId)])];
  return {
    version: s.version,
    day: s.state.day,
    you: { userId: s.you, characterId: mine?.id ?? null, admin: s.admin },
    offers: needsCharacter ? characterOffers(s.state, s.you) : null,
    // The core's view type is read-only; the parsed type is the same shape.
    game: toPlayerView(s.state) as PlayerView['game'],
    players: users.map((userId) => {
      const c = characterOf(s.state, userId) ?? null;
      return {
        userId,
        name: NAMES[userId] ?? 'Player',
        characterId: c?.id ?? null,
        role: c?.role ?? null,
        joinedDay: c?.joinedDay ?? null,
      };
    }),
    devTools: true,
  };
}

function must(result: ReturnType<typeof addCharacter>): GameState {
  if (!result.ok) throw new Error(`fixture: ${result.reason}`);
  return result.state;
}

/** Moves a user's character onto a hex (setting up a scenario, not a rule). */
function place(state: GameState, userId: string, hex: Hex): GameState {
  return {
    ...state,
    characters: state.characters.map((c) => (c.userId === userId ? { ...c, at: onHex(hex) } : c)),
  };
}

/** Joining or replacing as `role` with offer `offer`, through the core like the server does. */
export function joinScenario(s: Scenario, role: string, offer: number): Scenario {
  const mine = characterOf(s.state, s.you);
  const request = { userId: s.you, role, offer };
  const result = mine ? replaceCharacter(s.state, request) : addCharacter(s.state, request);
  return { ...s, state: must(result), version: s.version + 1 };
}

/** Before joining: Pip rides the creature and Ola stands beside it; you have offers to pick from. */
export function notJoinedScenario(): Scenario {
  let state = createGame(SEED, { artSeed: ART_SEED });
  state = must(addCharacter(state, { userId: PIP, role: 'keeper', offer: 0 }));
  state = must(addCharacter(state, { userId: OLA, role: 'envoy', offer: 1 }));
  const c = state.creature.centre;
  state = place(state, OLA, { q: c.q, r: c.r + 2 });
  return { state, you: MISA, version: 3, admin: true };
}

/** Joined: you and Pip ride the creature, Ola stands on a hex beside it. */
export function joinedScenario(): Scenario {
  return joinScenario(notJoinedScenario(), 'scout', 0);
}

/** Your character was left behind and is lost; you may replace it. */
export function lostScenario(): Scenario {
  const joined = joinedScenario();
  const c = joined.state.creature.centre;
  let state = place(joined.state, MISA, { q: c.q, r: c.r + 4 });
  for (let i = 0; i < 4; i += 1) state = nextDay(state);
  return { ...joined, state, version: 12 };
}

export const notJoined = (): PlayerView => toView(notJoinedScenario());
export const joined = (): PlayerView => toView(joinedScenario());
export const lost = (): PlayerView => toView(lostScenario());

export const USERS = { MISA, PIP, OLA } as const;

/** A user's character id in a view (the core makes the ids). */
export const characterIdOf = (view: PlayerView, userId: string): string =>
  view.players.find((p) => p.userId === userId)?.characterId ?? '';
