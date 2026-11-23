/**
 * Idle stances (docs/design/stances.md): at the tick a character's unspent actions go to their
 * stance, so a player who is away, or who chose to wait, still contributes something. Stances
 * are content (`content/stances.ts`) read by tag and by what they need where the character is;
 * a stance that does not fit falls back to the default (rest). Every number is in the config.
 * Resting is nothing, and shakes off being struck. Server only where it needs the seed.
 */

import { type Stance, DEFAULT_STANCE, STANCES } from './content/index.ts';
import { act, checkAction } from './act.ts';
import { isPlaceReachable } from './actions.ts';
import { exploreHex, type GameEvent, isExplored, roleHas } from './features.ts';
import { type Hex, hexKey } from './hex.ts';
import { placeNeighbours } from './places.ts';
import { hashString, hashToUnit } from './random.ts';
import { earnXp, effectsOf } from './skills.ts';
import { recordEvents } from './stats.ts';
import type { Character, GameState, GameStateView, Threat } from './state.ts';
import { DEFEND_TAG, threatType } from './threats.ts';

const WATCH_STREAM = hashString('watch');

/** Stance tags rules read. */
export const REST_TAG = 'rest';
export const EXPLORE_TAG = 'explore';
export const AMBUSH_TAG = 'ambush';
export const GATHER_TAG = 'gather';
export const AID_TAG = 'aid';

/** The role tag of working on an unlock. */
const BUILD_TAG = 'build';

export const stanceType = (id: string): Stance =>
  STANCES.find((s) => s.id === id) ?? (STANCES.find((s) => s.id === DEFAULT_STANCE) as Stance);

/** Whether an id names a stance. */
export const isStance = (id: string): boolean => STANCES.some((s) => s.id === id);

/** The unexplored, known hexes next to a character that a watch could explore, in a fixed order. */
export const watchTargets = (state: GameStateView, c: Character): Hex[] =>
  placeNeighbours(state, c.at).flatMap((p) =>
    p.kind === 'hex' &&
    state.tiles[hexKey(p.hex)] &&
    !isExplored(state, p.hex) &&
    isPlaceReachable(state, p)
      ? [p.hex]
      : [],
  );

/** Whether a stance fits where a character is now (what it needs holds). */
export const stanceFits = (state: GameStateView, c: Character, stance: Stance): boolean => {
  switch (stance.needs) {
    case 'none':
      return true;
    case 'hex':
      return c.at.kind === 'hex';
    case 'riding':
      return c.at.kind === 'creature';
    case 'unexplored':
      return watchTargets(state, c).length > 0;
    case 'node': {
      // Whether there is something to gather here, whatever the actions left.
      const check = checkAction(state, c.id, { kind: 'gather' });
      return check.ok || check.reason === 'not-enough-actions';
    }
  }
};

/** The stance that will act at the tick: the chosen one, or the default when it does not fit. */
export const effectiveStance = (state: GameStateView, c: Character): Stance => {
  const chosen = stanceType(c.stance);
  return stanceFits(state, c, chosen) ? chosen : stanceType(DEFAULT_STANCE);
};

/**
 * Before the creature steps: unspent actions go to gathering, watching or working on the
 * unlock in progress (spent through the same rules as acting).
 */
export const applyStances = (
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  let next = state;
  const events: GameEvent[] = [];
  for (const { id } of state.characters) {
    const c = next.characters.find((x) => x.id === id) as Character;
    if (c.status !== 'active' || c.actionsLeft <= 0) continue;
    const stance = effectiveStance(next, c);
    if (stance.tags.includes(EXPLORE_TAG)) {
      const cost = next.config.stanceWatchCost;
      let left = c.actionsLeft;
      let targets = watchTargets(next, c);
      while (left >= cost && targets.length > 0) {
        const pick = [...targets].sort(
          (a, b) =>
            hashToUnit(next.seed, WATCH_STREAM, next.day, hashString(id), a.q, a.r) -
            hashToUnit(next.seed, WATCH_STREAM, next.day, hashString(id), b.q, b.r),
        )[0] as Hex;
        const explored = exploreHex(next, pick);
        const empty = !explored.state.features[hexKey(pick)];
        const made: GameEvent[] = [
          { kind: 'survey', hex: pick, characterId: id },
          ...explored.events,
          ...(empty ? [{ kind: 'survey-empty' as const, hex: pick, characterId: id }] : []),
        ];
        left -= cost;
        next = {
          ...explored.state,
          characters: explored.state.characters.map((x) =>
            x.id === id ? { ...x, actionsLeft: left } : x,
          ),
        };
        next = recordEvents(earnXp(next, id, 'survey', made), made, id);
        events.push(...made);
        targets = watchTargets(next, next.characters.find((x) => x.id === id) as Character);
      }
    } else if (stance.tags.includes(GATHER_TAG)) {
      for (;;) {
        const done = act(next, id, { kind: 'gather' });
        if (!done.ok) break;
        next = done.state;
        events.push(...done.events);
      }
    } else if (stance.tags.includes(AID_TAG) && roleHas(c, BUILD_TAG) && next.project) {
      for (;;) {
        const project = next.project;
        if (!project) break;
        const done = act(next, id, { kind: 'build', unlock: project.unlock });
        if (!done.ok) break;
        next = done.state;
        events.push(...done.events);
      }
    }
  }
  return { state: next, events };
};

/**
 * What the riders helping aboard take off each strike on the creature: one point per
 * `stanceHelpActionsPerGuard` unspent actions (an engineer's go to the unlock first), together at
 * most `stanceHelpGuardMax`.
 */
export const helpGuard = (state: GameStateView): number =>
  Math.min(
    state.config.stanceHelpGuardMax,
    state.characters.reduce((sum, c) => {
      if (c.status !== 'active' || c.at.kind !== 'creature') return sum;
      if (!effectiveStance(state, c).tags.includes(AID_TAG)) return sum;
      return sum + Math.floor(c.actionsLeft / state.config.stanceHelpActionsPerGuard);
    }, 0),
  );

/**
 * Characters lying in wait strike first at threats that end their move on, or cross, their hex:
 * their strike power once, plus `stanceAmbushPerAction` for each unspent action. Returns the
 * threats left (weakened ones keep going) and each striker's XP for it. `paths` are the hexes
 * each threat walked through this tick, by id.
 */
export const ambush = (
  state: GameState,
  threats: readonly Threat[],
  paths: ReadonlyMap<string, readonly Hex[]>,
): {
  readonly threats: Threat[];
  readonly events: GameEvent[];
  /** XP each striker earned: one for each strike, as a strike action does. */
  readonly xp: ReadonlyMap<string, number>;
} => {
  const events: GameEvent[] = [];
  const xp = new Map<string, number>();
  let left = threats.slice();
  for (const c of state.characters) {
    if (c.status !== 'active' || c.at.kind !== 'hex') continue;
    if (!effectiveStance(state, c).tags.includes(AMBUSH_TAG)) continue;
    const here = hexKey(c.at.hex);
    const power = roleHas(c, DEFEND_TAG)
      ? state.config.clearPowerGuardian
      : state.config.clearPowerOther;
    const bonuses = effectsOf(c, 'strike-bonus');
    const extra = state.config.stanceAmbushPerAction * c.actionsLeft;
    left = left.flatMap((t) => {
      const way = paths.get(t.id) ?? [];
      const crossed = (way.length > 0 ? way : [t.hex]).some((h) => hexKey(h) === here);
      if (!crossed) return [t];
      const tags = threatType(t.type).tags;
      const bonus = bonuses.filter((e) => tags.includes(e.tag)).reduce((s, e) => s + e.bonus, 0);
      const strength = Math.max(0, t.strength - power - bonus - extra);
      events.push({ kind: 'threat-hit', id: t.id, characterId: c.id, strength });
      xp.set(c.id, (xp.get(c.id) ?? 0) + 1);
      if (strength > 0) return [{ ...t, strength }];
      events.push({ kind: 'threat-cleared', id: t.id, characterId: c.id });
      return [];
    });
  }
  return { threats: left, events, xp };
};
