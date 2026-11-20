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
    events: [],
    eventsTruncated: false,
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

/** Hexes of the chain scenario, as offsets from the creature's centre. */
export const CHAIN_SPOTS = {
  /** Where you start (explored). */
  start: { q: 1, r: 2 },
  /** A hidden iron deposit. */
  iron: { q: 1, r: 3 },
  /** A hidden tomb. */
  tomb: { q: 2, r: 2 },
  /** A hidden snare, beside both the start and the deposit. */
  snare: { q: 0, r: 3 },
  /** A cliff beside the deposit, only for climbers. */
  cliff: { q: 1, r: 4 },
} as const;

export interface ChainStage {
  readonly role?: string;
  /** Where you stand: a spot, or riding the creature. Default `start`. */
  readonly at?: keyof typeof CHAIN_SPOTS | 'creature';
  readonly day?: number;
  readonly pack?: Readonly<Record<string, number>>;
  readonly stores?: Readonly<Record<string, number>>;
  readonly unlocks?: readonly string[];
  readonly project?: { readonly unlock: string; readonly work: number } | null;
  /** Spots already explored (their features revealed). */
  readonly explored?: readonly (keyof typeof CHAIN_SPOTS)[];
}

/**
 * Milestone 3's chain staged south of the creature: you stand as `role` on explored open ground beside a
 * hidden iron deposit, a hidden tomb and a hidden snare, with a cliff beyond the deposit. The seed's own
 * features are cleared so only these show; the ground around them is set to plains and forest.
 */
export function chainScenario(stage: ChainStage = {}): Scenario {
  const s = joinScenario(notJoinedScenario(), stage.role ?? 'scout', 0);
  const c = s.state.creature.centre;
  const abs = (h: Hex): Hex => ({ q: c.q + h.q, r: c.r + h.r });
  const key = (h: Hex): string => `${c.q + h.q},${c.r + h.r}`;
  const explored = new Set<string>(['start', ...(stage.explored ?? [])]);
  const tiles = { ...s.state.tiles };
  for (let dq = -1; dq <= 3; dq += 1) {
    for (let dr = 1; dr <= 5; dr += 1) {
      const k = key({ q: dq, r: dr });
      const known = tiles[k];
      if (known) tiles[k] = { ...known, terrain: (dq + dr) % 3 === 0 ? 'forest' : 'plains' };
    }
  }
  for (const [name, h] of Object.entries(CHAIN_SPOTS)) {
    const k = key(h);
    const known = tiles[k];
    if (!known) continue;
    tiles[k] = {
      ...known,
      ...(name === 'cliff' ? { terrain: 'cliff' } : {}),
      explored: explored.has(name),
    };
  }
  const feature = (spot: keyof typeof CHAIN_SPOTS, type: string, left: number) => ({
    [key(CHAIN_SPOTS[spot])]: { type, revealed: explored.has(spot), left },
  });
  let state: GameState = {
    ...s.state,
    day: stage.day ?? s.state.day,
    tiles,
    features: {
      ...feature('iron', 'iron-deposit', 3),
      ...feature('tomb', 'tomb', 1),
      ...feature('snare', 'snare', 1),
    },
    stores: stage.stores ?? {},
    unlocks: stage.unlocks ?? [],
    project: stage.project ?? null,
  };
  const at = stage.at ?? 'start';
  if (at !== 'creature') state = place(state, MISA, abs(CHAIN_SPOTS[at]));
  state = {
    ...state,
    characters: state.characters.map((ch) =>
      ch.userId === MISA ? { ...ch, pack: stage.pack ?? {} } : ch,
    ),
  };
  return { ...s, state, version: s.version + 1 };
}

export const notJoined = (): PlayerView => toView(notJoinedScenario());
export const joined = (): PlayerView => toView(joinedScenario());
export const lost = (): PlayerView => toView(lostScenario());

export const USERS = { MISA, PIP, OLA } as const;

/** A user's character id in a view (the core makes the ids). */
export const characterIdOf = (view: PlayerView, userId: string): string =>
  view.players.find((p) => p.userId === userId)?.characterId ?? '';
