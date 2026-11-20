/**
 * Milestone 5 as the web client reads it from the player view, on the core's own rules: threats and their
 * outlook, striking one, defending the creature, the settlements and what you can do at one, escort and
 * struck marks, peril, the route and the season's end. Every "can I" comes from `checkAction`; the
 * client never keeps its own copy of a rule.
 */
import {
  type Arrival,
  checkAction,
  ESCORT_TAG,
  type GameStateView,
  type Hex,
  hexDistance,
  hexEquals,
  MATERIALS,
  PEOPLE_TYPES,
  roleHas,
  THREAT_TYPES,
  threatOutlook,
  TRADE_TAG,
} from '@behemoth-road/core';
import type { CostedAction } from './chain.ts';

/** A threat as the map draws it: where, what (content icon), how strong, and its outlook. */
export interface ThreatMark {
  readonly id: string;
  readonly hex: Hex;
  readonly icon: string;
  readonly name: string;
  readonly strength: number;
  readonly arrives: Arrival;
  /** The hex it steps to first at the next tick, or null when it waits. */
  readonly next: Hex | null;
}

/** Every threat on the map with the core's outlook (`threatOutlook`). Unknown types draw a plain mark. */
export function threatMarks(game: GameStateView): ThreatMark[] {
  const outlook = new Map(threatOutlook(game).map((o) => [o.id, o]));
  return game.threats.map((t) => {
    const type = THREAT_TYPES.find((x) => x.id === t.type);
    const o = outlook.get(t.id);
    return {
      id: t.id,
      hex: t.hex,
      icon: type?.icon ?? t.type,
      name: type?.name ?? '',
      strength: t.strength,
      arrives: o?.arrives ?? 'never',
      next: o?.next ?? null,
    };
  });
}

/** The threat on a hex, if any. */
export const threatAt = (game: GameStateView, h: Hex): string | null =>
  game.threats.find((t) => hexEquals(t.hex, h))?.id ?? null;

/** The settlement on a hex, if any. */
export const settlementAt = (game: GameStateView, h: Hex): string | null =>
  game.settlements.find((s) => hexEquals(s.hex, h))?.id ?? null;

/** A button in a card: its cost, and whether it can be done now. */
export interface Offered {
  readonly cost: number;
  readonly enabled: boolean;
}

/** Refusals that mean "this is for you here, just not now": the button shows faded. */
const NOT_NOW: ReadonlySet<string> = new Set(['not-enough-actions']);

const offered = (check: ReturnType<typeof checkAction>): Offered | null => {
  if (check.ok) return { cost: check.cost, enabled: true };
  if (NOT_NOW.has(check.reason) && check.cost !== undefined) {
    return { cost: check.cost, enabled: false };
  }
  return null;
};

/** A threat's card: its name, strength and, when you stand on or next to it, the strike. */
export interface ThreatCardInfo {
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly strength: number;
  readonly strike: Offered | null;
}

export function threatCard(
  game: GameStateView,
  characterId: string,
  threatId: string,
): ThreatCardInfo | null {
  const mark = threatMarks(game).find((t) => t.id === threatId);
  if (!mark) return null;
  return {
    id: mark.id,
    icon: mark.icon,
    name: mark.name,
    strength: mark.strength,
    strike: offered(checkAction(game, characterId, { kind: 'strike', threat: threatId })),
  };
}

/**
 * Defending the creature, for the hub, like a linger: only for guardians (none otherwise), faded unless
 * riding with the actions, sealed once done today.
 */
export function defendOption(game: GameStateView, characterId: string): CostedAction | null {
  const check = checkAction(game, characterId, { kind: 'defend' });
  if (check.ok) return { kind: 'defend', cost: check.cost, enabled: true, uses: null };
  if (check.reason === 'needs-guardian' || check.cost === undefined) return null;
  if (check.reason === 'already-have') {
    return { kind: 'defend', cost: check.cost, enabled: false, uses: null, done: true };
  }
  if (check.reason === 'not-riding' || check.reason === 'not-enough-actions') {
    return { kind: 'defend', cost: check.cost, enabled: false, uses: null };
  }
  return null;
}

/** A settlement's card from afar: how it is drawn, and its people's name. */
export interface SettlementInfo {
  readonly id: string;
  readonly hex: Hex;
  readonly attitude: 'wary' | 'friendly' | 'angry';
  readonly favour: number;
  readonly needed: number;
  readonly boon: string | null;
}

export function settlementInfo(game: GameStateView, id: string): SettlementInfo | null {
  const s = game.settlements.find((x) => x.id === id);
  if (!s) return null;
  const type = PEOPLE_TYPES.find((p) => p.id === s.type);
  return {
    id: s.id,
    hex: s.hex,
    attitude: s.attitude,
    favour: s.favour,
    needed: type?.favourNeeded ?? 0,
    boon: s.boon,
  };
}

/** One thing to do at a settlement, as a here-card button. `kind` is the action kind (a boon: `boon:<id>`). */
export interface SettlementAction {
  readonly kind: string;
  readonly cost: number;
  readonly enabled: boolean;
  /** A trade good it takes from your pack (offer). */
  readonly uses?: string | null;
  /** Parley may anger it (the core's published chance is below 1). */
  readonly risk?: boolean;
}

const TRADE_GOODS = MATERIALS.filter((m) => m.tags.includes(TRADE_TAG)).map((m) => m.id);

/**
 * What you can do at the settlement you stand on: parley (with its risk) and offer each trade good you
 * carry while it is wary; once friendly, its boons until one is taken. Faded when your actions are spent;
 * nothing anywhere else.
 */
export function settlementActions(game: GameStateView, characterId: string): SettlementAction[] {
  const out: SettlementAction[] = [];
  const parley = checkAction(game, characterId, { kind: 'parley' });
  const p = offered(parley);
  if (p) out.push({ kind: 'parley', ...p, risk: parley.ok ? parley.chance < 1 : false });
  for (const material of TRADE_GOODS) {
    const o = offered(checkAction(game, characterId, { kind: 'offer', material }));
    if (o) out.push({ kind: 'offer', ...o, uses: material });
  }
  const me = game.characters.find((c) => c.id === characterId);
  const at = me?.at.kind === 'hex' ? me.at.hex : null;
  const here = at ? game.settlements.find((s) => hexEquals(s.hex, at)) : null;
  const boons = here ? (PEOPLE_TYPES.find((t) => t.id === here.type)?.boons ?? []) : [];
  for (const boon of boons) {
    const b = offered(checkAction(game, characterId, { kind: 'ask-boon', boon }));
    if (b) out.push({ kind: `boon:${boon}`, ...b });
  }
  return out;
}

/**
 * Characters a guardian's escort covers: active, on a hex within 1 of an active guardian on a hex, guardians
 * themselves left out (they carry their own ring). The core's rule (`threats.ts`), read through this one
 * function until the core exports it.
 */
export function escortedIds(game: GameStateView): Set<string> {
  const guards = game.characters.filter(
    (g) => g.status === 'active' && g.at.kind === 'hex' && roleHas(g, ESCORT_TAG),
  );
  const out = new Set<string>();
  for (const c of game.characters) {
    if (c.status !== 'active' || c.at.kind !== 'hex' || roleHas(c, ESCORT_TAG)) continue;
    const at = c.at.hex;
    if (guards.some((g) => g.at.kind === 'hex' && hexDistance(g.at.hex, at) <= 1)) out.add(c.id);
  }
  return out;
}

/** Guardians standing on a hex: each shows the soft ring of its escort. */
export const escortCentres = (game: GameStateView): Hex[] =>
  game.characters.flatMap((g) =>
    g.status === 'active' && g.at.kind === 'hex' && roleHas(g, ESCORT_TAG) ? [g.at.hex] : [],
  );

/** Whether a threat struck this character today (it shows a bandage for the day). */
// Read loosely until the core's `Character.struckDay` lands; then this is `c.struckDay === day`.
export const struckToday = (c: object, day: number): boolean =>
  'struckDay' in c && c.struckDay === day;

/** How the season ended, or null while it goes on. */
export const seasonEnd = (
  game: GameStateView,
): { readonly outcome: 'safe' | 'wounded' | 'lost'; readonly day: number } | null =>
  game.season.status === 'over' ? { outcome: game.season.outcome, day: game.season.day } : null;

/** The three ending titles: the only words on the ending screen. */
export const ENDING_TITLES = {
  safe: 'Home safe',
  wounded: 'Home, wounded',
  lost: 'Lost',
} as const;
