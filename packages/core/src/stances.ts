/**
 * Idle stances (docs/design/stances.md): at the tick a character's unspent actions go to their
 * stance, so a player who is away, or who chose to wait, still contributes something. Stances
 * are content (`content/stances.ts`) read by tag and by what they need where the character is;
 * a stance that does not fit falls back to the default (rest). Every number is in the config.
 * Resting is nothing. The guiding rule: a stance is an activity a player could do with their actions
 * anywhere, so it is never stronger than a specialist's active action. Server only where it needs the seed.
 */

import { type Stance, DEFAULT_STANCE, STANCES } from './content/index.ts';
import { act, checkAction } from './act.ts';
import { type GameEvent, roleHas } from './features.ts';
import { type Hex, hexKey } from './hex.ts';
import { effectsOf } from './skills.ts';
import type { Character, GameState, GameStateView, Threat } from './state.ts';
import { DEFEND_TAG, threatType } from './threats.ts';

/** Stance tags rules read. */
export const REST_TAG = 'rest';
export const AMBUSH_TAG = 'ambush';
export const GATHER_TAG = 'gather';

export const stanceType = (id: string): Stance =>
  STANCES.find((s) => s.id === id) ?? (STANCES.find((s) => s.id === DEFAULT_STANCE) as Stance);

/** Whether an id names a stance. */
export const isStance = (id: string): boolean => STANCES.some((s) => s.id === id);

/** Whether a stance fits where a character is now (what it needs holds). */
export const stanceFits = (state: GameStateView, c: Character, stance: Stance): boolean => {
  switch (stance.needs) {
    case 'none':
      return true;
    case 'hex':
      return c.at.kind === 'hex';
    case 'node': {
      // Whether there is something to gather here, whatever the actions left or whether the day is ended.
      const check = checkAction(state, c.id, { kind: 'gather' });
      return check.ok || check.reason === 'not-enough-actions' || check.reason === 'waiting';
    }
  }
};

/** The stance that will act at the tick: the chosen one, or the default when it does not fit. */
export const effectiveStance = (state: GameStateView, c: Character): Stance => {
  const chosen = stanceType(c.stance);
  return stanceFits(state, c, chosen) ? chosen : stanceType(DEFAULT_STANCE);
};

/**
 * Before the creature steps: unspent actions go to gathering from the node on the hex, through the
 * same rules as the gather action (so never more per action than gathering by hand).
 */
export const applyStances = (
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  let next = state;
  const events: GameEvent[] = [];
  for (const { id } of state.characters) {
    const c = next.characters.find((x) => x.id === id) as Character;
    if (c.status !== 'active' || c.actionsLeft <= 0) continue;
    if (!effectiveStance(next, c).tags.includes(GATHER_TAG)) continue;
    // The stance acts for a waiting character too (waiting only stops them acting by hand).
    next = {
      ...next,
      characters: next.characters.map((x) => (x.id === id ? { ...x, waiting: false } : x)),
    };
    for (;;) {
      const done = act(next, id, { kind: 'gather' });
      if (!done.ok) break;
      next = done.state;
      events.push(...done.events);
    }
  }
  return { state: next, events };
};

/**
 * Characters lying in wait strike first at threats that end their move on, or cross, their hex:
 * their strike power once, plus `stanceAmbushPerAction` for each unspent action after the first. Returns the
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
    if (c.status !== 'active' || c.at.kind !== 'hex' || c.actionsLeft <= 0) continue;
    if (!effectiveStance(state, c).tags.includes(AMBUSH_TAG)) continue;
    const here = hexKey(c.at.hex);
    const power = roleHas(c, DEFEND_TAG)
      ? state.config.clearPowerWarden
      : state.config.clearPowerOther;
    const bonuses = effectsOf(c, 'strike-bonus');
    // The first action strikes as an active strike would; each further one adds at most as much as the
    // weakest active strike (`stanceAmbushPerAction` is validated against it), so lying in wait never
    // beats striking by hand.
    const extra = state.config.stanceAmbushPerAction * (c.actionsLeft - 1);
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
