/**
 * Milestone 5 as the web client reads it from the player view, on the core's own rules: threats and their
 * outlook, striking one, defending the creature, the settlements and what you can do at one, escort and
 * struck marks, peril, the route and the season's end. Every "can I" comes from `checkAction`; the
 * client never keeps its own copy of a rule.
 */
import {
  type Arrival,
  checkAction,
  type Character,
  defence,
  ESCORT_TAG,
  type GameStateView,
  type Hex,
  hexEquals,
  escortReach,
  fallChance,
  FEARS_FIRE_TAG,
  isEscorted,
  MATERIALS,
  PEOPLE_TYPES,
  roleHas,
  THREAT_TYPES,
  threatOutlook,
  threatNextPath,
  TRADE_TAG,
} from '@behemoth-road/core';
import type { CostedAction } from './chain.ts';
import type { TipId } from '../text/tips.ts';
import { neededRole } from './roles.ts';
import { whyTip } from './why.ts';

/** A threat as the map draws it: where, what (content icon), how strong, and its outlook. */
export interface ThreatMark {
  readonly id: string;
  /** Its content type id. */
  readonly type: string;
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
      type: t.type,
      hex: t.hex,
      icon: type?.icon ?? t.type,
      name: type?.name ?? '',
      strength: t.strength,
      arrives: o?.arrives ?? 'never',
      next: o?.next ?? null,
    };
  });
}

/** The hexes a threat crosses at the next tick, its end last (the core's guess: public view only). */
export { threatNextPath };

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
  /** Why it is greyed (the core's refusal, as a tip), when it is. */
  readonly why?: TipId;
}

/** Refusals that mean "this is for you here, just not now": the button shows faded. */
const NOT_NOW: ReadonlySet<string> = new Set(['not-enough-actions']);

const offered = (check: ReturnType<typeof checkAction>): Offered | null => {
  if (check.ok) return { cost: check.cost, enabled: true };
  if (NOT_NOW.has(check.reason) && check.cost !== undefined) {
    return { cost: check.cost, enabled: false, why: whyTip(check.reason) };
  }
  return null;
};

/** A threat's card: its name, strength and, when you stand on or next to it, the strike. */
export interface ThreatCardInfo {
  readonly id: string;
  /** Its content type id. */
  readonly type: string;
  readonly icon: string;
  readonly name: string;
  readonly strength: number;
  /** How many hexes it moves at the next tick (`threatNextPath`). */
  readonly steps: number;
  readonly strike: Offered | null;
  /** What the creature's defenders take off this threat's strike on it (the core's `defence`); 0 undefended. */
  readonly defence: number;
  /** Keeps clear of a burning fire (content tag `fears-fire`): its mark shows. */
  readonly fears: boolean;
  /** The chance a strike brings it down on you (`fallChance`, 0 to 1), or null when it does not fall. */
  readonly fall: number | null;
}

export function threatCard(
  game: GameStateView,
  characterId: string,
  threatId: string,
): ThreatCardInfo | null {
  const mark = threatMarks(game).find((t) => t.id === threatId);
  if (!mark) return null;
  const tags = THREAT_TYPES.find((t) => t.id === mark.type)?.tags ?? [];
  const me = game.characters.find((c) => c.id === characterId);
  const fall = me ? fallChance(game, me, tags) : 0;
  return {
    id: mark.id,
    type: mark.type,
    icon: mark.icon,
    name: mark.name,
    strength: mark.strength,
    steps: threatNextPath(game, threatId).length,
    strike: offered(checkAction(game, characterId, { kind: 'strike', threat: threatId })),
    defence: defence(game),
    fears: tags.includes(FEARS_FIRE_TAG),
    fall: fall > 0 ? fall : null,
  };
}

/**
 * How the creature is defended today: the wardens riding it who defended (each one's shield) and what
 * their defence takes off every strike on it (the core's `defence`, so the number is the rule's own).
 */
export function defendedBy(game: GameStateView): {
  readonly wardens: number;
  readonly reduction: number;
} {
  const reduction = defence(game);
  const per = game.config.defendReduction;
  return { wardens: per > 0 ? Math.round(reduction / per) : 0, reduction };
}

/**
 * Defending the creature, for the hub, like a linger: greyed with the warden's emblem for anyone else,
 * faded unless riding with the actions, sealed once done today.
 */
export function defendOption(game: GameStateView, characterId: string): CostedAction | null {
  const check = checkAction(game, characterId, { kind: 'defend' });
  if (check.ok) return { kind: 'defend', cost: check.cost, enabled: true, uses: null };
  if (check.cost === undefined) return null;
  const needs = neededRole(game, characterId, { kind: 'defend' }, check);
  const why = whyTip(check.reason, needs);
  if (needs) return { kind: 'defend', cost: check.cost, enabled: false, uses: null, needs, why };
  if (check.reason === 'already-have') {
    return { kind: 'defend', cost: check.cost, enabled: false, uses: null, done: true, why };
  }
  if (check.reason === 'not-riding' || check.reason === 'not-enough-actions') {
    return { kind: 'defend', cost: check.cost, enabled: false, uses: null, why };
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
  /** The people's content icon (the art kit's settlement look). */
  readonly look: string;
  /** The people's name (content), shown on its card. */
  readonly name: string;
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
    look: type?.icon ?? s.type,
    name: type?.name ?? '',
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
  /** Why it is greyed (the core's refusal, as a tip), when it is. */
  readonly why?: TipId;
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
 * Characters a warden's escort covers (the shield mark): active, on a hex the core counts as escorted
 * (`isEscorted`), wardens themselves left out (their own escort shows as the ring).
 */
export function escortedIds(game: GameStateView): Set<string> {
  return new Set(
    game.characters
      .filter(
        (c) =>
          c.status === 'active' &&
          c.at.kind === 'hex' &&
          !roleHas(c, ESCORT_TAG) &&
          isEscorted(game, c.at.hex),
      )
      .map((c) => c.id),
  );
}

/** Wardens standing on a hex: each shows the soft ring of its escort. */
export const escortCentres = (game: GameStateView): Hex[] => escorts(game).map((e) => e.hex);

/** The same wardens with how far each one's escort reaches (more with a wide-guard skill). */
export const escorts = (game: GameStateView): { hex: Hex; reach: number }[] =>
  game.characters.flatMap((g) =>
    g.status === 'active' && g.at.kind === 'hex' && roleHas(g, ESCORT_TAG)
      ? [{ hex: g.at.hex, reach: escortReach(g) }]
      : [],
  );

/** Whether a threat struck this character today (it shows a bandage for the day). */
export const struckToday = (c: Pick<Character, 'struckDay'>, day: number): boolean =>
  c.struckDay === day;

/** How the season ended, or null while it goes on. */
export const seasonEnd = (
  game: GameStateView,
): { readonly outcome: 'safe' | 'wounded' | 'lost'; readonly day: number } | null =>
  game.season.status === 'over' ? { outcome: game.season.outcome, day: game.season.day } : null;

/** The ending titles for a creature that stays (the Mossback); the core's `endingOf` has them for every fate. */
export const ENDING_TITLES = {
  safe: 'Arrived',
  wounded: 'Arrived, wounded',
  lost: 'Lost',
} as const;
