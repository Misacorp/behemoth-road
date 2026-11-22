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
  creatureSigns,
  glintsFor,
  type GameState,
  type Hex,
  nextDay,
  type Reaction,
  onHex,
  type Season,
  type CharacterTally,
  type SeasonStats,
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
  // The fake game server has no sockets.
  live: false,
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
  /** How days advance (default daily) and, in fast pace, when the early tick is due (default none). */
  readonly pace?: 'daily' | 'fast';
  readonly fastTickAt?: number | null;
  /** The server's clock (epoch ms); default: this machine's, so no skew. */
  readonly now?: number;
}

/** The view the server would send `scenario.you`. */
export function toView(s: Scenario): PlayerView {
  const mine = characterOf(s.state, s.you) ?? null;
  const needsCharacter = mine === null || mine.status === 'lost';
  const users = [...new Set([s.you, ...s.state.characters.map((c) => c.userId)])];
  return {
    version: s.version,
    day: s.state.day,
    pace: s.pace ?? 'daily',
    fastTickAt: s.fastTickAt ?? null,
    now: s.now ?? Date.now(),
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
    // Per viewer, as the Worker computes them: for your active character, or no viewer.
    signs: creatureSigns(
      s.state,
      mine?.status === 'active' ? mine.id : null,
    ) as PlayerView['signs'],
    glints: glintsFor(s.state, mine?.status === 'active' ? mine.id : null),
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
  /** The node on the deposit spot (a feature id); default the iron deposit. */
  readonly deposit?: string;
  /** Milestone 4: fires lit today, as offsets from the creature's centre. */
  readonly fires?: readonly Hex[];
  /** The creature's hidden hunger (server only; drives the appetite sign). */
  readonly satiety?: number;
  /**
   * Reactions felt at the last tick (shown to keepers today), as offsets from the centre. The hidden state
   * holds the core's `Reaction` (attracted, repelled, indifferent); a keeper reads it as toward, away, unmoved.
   */
  readonly cues?: readonly { readonly at: Hex; readonly reaction: Reaction }[];
  readonly lingering?: boolean;
  readonly lingeredDay?: number | null;
  /** Skills: notches earned by role id, and the nodes already taken (set up, not played). */
  readonly notches?: Readonly<Record<string, number>>;
  readonly taken?: readonly string[];
  /** Skills of another character (Pip, the keeper) on the same terms. */
  readonly pipTaken?: readonly string[];
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
      ...feature('iron', stage.deposit ?? 'iron-deposit', 3),
      ...feature('tomb', 'tomb', 1),
      ...feature('snare', 'snare', 1),
    },
    stores: stage.stores ?? {},
    unlocks: stage.unlocks ?? [],
    project: stage.project ?? null,
  };
  const day = state.day;
  state = {
    ...state,
    stimuli: (stage.fires ?? []).map((h) => ({ type: 'fire', hex: abs(h), litDay: day })),
    care: {
      satiety: stage.satiety ?? state.care.satiety,
      cues: {
        day,
        list: (stage.cues ?? []).map((cue) => ({
          hex: abs(cue.at),
          stimulus: 'fire',
          reaction: cue.reaction,
        })),
      },
    },
    creature: {
      ...state.creature,
      lingering: stage.lingering ?? false,
      lingeredDay: stage.lingeredDay ?? null,
    },
  };
  const at = stage.at ?? 'start';
  if (at !== 'creature') state = place(state, MISA, abs(CHAIN_SPOTS[at]));
  state = {
    ...state,
    characters: state.characters.map((ch) =>
      ch.userId === MISA
        ? {
            ...ch,
            pack: stage.pack ?? {},
            skills: { notches: { ...stage.notches }, taken: [...(stage.taken ?? [])] },
          }
        : ch.userId === PIP && stage.pipTaken
          ? { ...ch, skills: { ...ch.skills, taken: [...stage.pipTaken] } }
          : ch,
    ),
  };
  return { ...s, state, version: s.version + 1 };
}

/** Milestone 5's staging on top of the chain scenario: threats, settlements, peril, the route, the end. */
export interface SeasonStage extends ChainStage {
  /** Threats by content type, as offsets from the creature's centre. */
  readonly threats?: readonly {
    readonly type: string;
    readonly at: Hex;
    readonly strength?: number;
  }[];
  /** Settlements of the hill folk, as offsets from the centre. */
  readonly settlements?: readonly {
    readonly at: Hex;
    readonly attitude?: 'wary' | 'friendly' | 'angry';
    readonly favour?: number;
    readonly boon?: string | null;
  }[];
  readonly peril?: number;
  readonly steps?: number;
  readonly season?: Season;
  /** Ola (an envoy, on a hex beside the creature) plays as a guardian standing at this offset. */
  readonly guardianAt?: Hex;
  /** Your character defends the creature today (it must be a guardian riding). */
  readonly defending?: boolean;
  /** The season's tallies so far (the recap's numbers), the players' by user id; default none. */
  readonly stats?: {
    readonly shared?: Partial<SeasonStats['shared']>;
    readonly byUser?: Readonly<Record<string, Partial<CharacterTally>>>;
  };
}

/**
 * Milestone 5 staged on the chain scenario: threats and settlements placed by hand (as the tick would place
 * them), peril, the route walked and the season's state. Everything after the staging (strikes, parleys,
 * ticks) runs through the real core.
 */
export function seasonScenario(stage: SeasonStage = {}): Scenario {
  const s = chainScenario(stage);
  const c = s.state.creature.centre;
  const abs = (h: Hex): Hex => ({ q: c.q + h.q, r: c.r + h.r });
  const day = s.state.day;
  let state: GameState = {
    ...s.state,
    threats: (stage.threats ?? []).map((t, i) => ({
      id: `threat-${String(i + 1)}`,
      type: t.type,
      hex: abs(t.at),
      strength: t.strength ?? 3,
      appearedDay: day,
    })),
    settlements: (stage.settlements ?? []).map((x, i) => ({
      id: `settlement-${String(i + 1)}`,
      type: 'hill-folk',
      hex: abs(x.at),
      attitude: x.attitude ?? 'wary',
      favour: x.favour ?? 0,
      boon: x.boon ?? null,
    })),
    peril: stage.peril ?? 0,
    season: stage.season ?? { status: 'on' },
    stats: {
      shared: { ...s.state.stats.shared, ...stage.stats?.shared },
      byCharacter: Object.fromEntries(
        s.state.characters.flatMap((ch) => {
          const t = stage.stats?.byUser?.[ch.userId];
          return t ? [[ch.id, { explored: 0, strikes: 0, gathered: 0, fed: 0, ...t }]] : [];
        }),
      ),
    },
    creature: { ...s.state.creature, steps: stage.steps ?? 0, defenders: [] },
  };
  if (stage.guardianAt) {
    state = place(state, OLA, abs(stage.guardianAt));
    state = {
      ...state,
      characters: state.characters.map((ch) =>
        ch.userId === OLA ? { ...ch, role: 'guardian' } : ch,
      ),
    };
  }
  if (stage.defending) {
    const mine = characterOf(state, MISA);
    if (mine) state = { ...state, creature: { ...state.creature, defenders: [mine.id] } };
  }
  return { ...s, state, version: s.version + 1 };
}

/** After an admin starts a new season: a new game (a new seed), no characters; everyone joins again. */
export function newSeasonScenario(): Scenario {
  return {
    state: createGame(SEED + 1, { artSeed: ART_SEED + 1 }),
    you: MISA,
    version: 1,
    admin: true,
  };
}

export const notJoined = (): PlayerView => toView(notJoinedScenario());
export const joined = (): PlayerView => toView(joinedScenario());
export const lost = (): PlayerView => toView(lostScenario());

export const USERS = { MISA, PIP, OLA } as const;

/** A user's character id in a view (the core makes the ids). */
export const characterIdOf = (view: PlayerView, userId: string): string =>
  view.players.find((p) => p.userId === userId)?.characterId ?? '';
