/**
 * The creature's hidden nature and condition, and what players see of them.
 * The nature (how it reacts to each stimulus) is rolled from the seed when the
 * game starts; the condition (hunger) changes with feeding and each tick. Both
 * stay on the server: players read only symptoms (`creatureSigns`), and keepers
 * read them clearer. Roles and stimuli are read by their tags, never by id.
 */

import {
  CREATURE_TYPES,
  type CreatureType,
  MATERIALS,
  type Reaction,
  STIMULUS_TYPES,
  type StimulusType,
} from './content/index.ts';
import { roleHas } from './features.ts';
import type { Hex } from './hex.ts';
import { hashString, hashToUnit, type Seed } from './random.ts';
import type { Care, GameState, GameStateView, Materials, Nature, Stimulus } from './state.ts';

const NATURE_STREAM = hashString('creature-nature');

/** The role tag that marks a keeper: sees the creature clearer, can make it linger. */
export const KEEPER_TAG = 'tend';
/** The material tag the creature eats. */
export const FOOD_TAG = 'food';

export const creatureType = (id: string): CreatureType => {
  const type = CREATURE_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown creature type: ${id}`);
  return type;
};

export const stimulusType = (id: string): StimulusType => {
  const type = STIMULUS_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown stimulus: ${id}`);
  return type;
};

/** A new game's creature: its type and, per stimulus tag, a seeded pick of its reactions. */
export const rollNature = (seed: Seed): Nature => {
  const types = CREATURE_TYPES;
  const type = types[Math.floor(hashToUnit(seed, NATURE_STREAM) * types.length)] as CreatureType;
  const reactions: Record<string, Reaction> = {};
  for (const [tag, options] of Object.entries(type.reactions)) {
    const roll = hashToUnit(seed, NATURE_STREAM, hashString(tag));
    reactions[tag] = options[Math.floor(roll * options.length)] as Reaction;
  }
  return { type: type.id, reactions };
};

/** A new game's condition: the type's starting hunger and no cues. */
export const freshCare = (nature: Nature, day: number): Care => ({
  satiety: creatureType(nature.type).hunger.start,
  cues: { day, list: [] },
});

/** How the creature reacts to a stimulus: by the first of its tags the nature lists. */
export const reactionTo = (nature: Nature, stimulus: Stimulus): Reaction => {
  for (const tag of stimulusType(stimulus.type).tags) {
    const reaction = nature.reactions[tag];
    if (reaction) return reaction;
  }
  return 'indifferent';
};

export type AppetiteKind = 'underfed' | 'overfed';
export type SignLevel = 1 | 2 | 3;
/** The strongest appetite level (a starving creature eats from the stores). */
export const MAX_SIGN_LEVEL: SignLevel = 3;

export interface Appetite {
  readonly kind: AppetiteKind;
  readonly level: SignLevel;
}

/**
 * The creature's appetite from its satiety: how far below or above the
 * comfortable band it is, from 1 to 3; null inside the band.
 */
export const appetiteOf = (state: GameState): Appetite | null => {
  const { comfortable } = creatureType(state.nature.type).hunger;
  const satiety = state.care.satiety;
  const level = (by: number): SignLevel => Math.min(MAX_SIGN_LEVEL, by) as SignLevel;
  if (satiety < comfortable.min)
    return { kind: 'underfed', level: level(comfortable.min - satiety) };
  if (satiety > comfortable.max)
    return { kind: 'overfed', level: level(satiety - comfortable.max) };
  return null;
};

/** What a keeper sees the creature do about a stimulus. */
export type CueGesture = 'toward' | 'away' | 'unmoved';

const GESTURES: Readonly<Record<Reaction, CueGesture>> = {
  attracted: 'toward',
  repelled: 'away',
  indifferent: 'unmoved',
};

/** What one viewer can read off the creature. Not part of the shared view. */
export interface CreatureSigns {
  readonly appetite: Appetite | null;
  /** Empty unless the viewer is a keeper. */
  readonly cues: readonly {
    readonly hex: Hex;
    readonly stimulus: string;
    readonly reaction: CueGesture;
  }[];
}

/** Whether a character is an active keeper (its role carries `tend`). */
export const isKeeper = (state: GameStateView, characterId: string | null): boolean => {
  const c = characterId === null ? undefined : state.characters.find((x) => x.id === characterId);
  return c !== undefined && c.status === 'active' && roleHas(c, KEEPER_TAG);
};

/**
 * The creature's signs for one viewer (their active character, or null). A
 * keeper sees the appetite from level 1 and the reactions felt at the last tick;
 * anyone else sees only levels 2 and 3, and then faintly (as level 1).
 */
export const creatureSigns = (
  state: GameState,
  viewerCharacterId: string | null,
): CreatureSigns => {
  const keeper = isKeeper(state, viewerCharacterId);
  const appetite = appetiteOf(state);
  const seen = !appetite
    ? null
    : keeper
      ? appetite
      : appetite.level >= 2
        ? { kind: appetite.kind, level: 1 as const }
        : null;
  const cues =
    keeper && state.care.cues.day === state.day
      ? state.care.cues.list.map((c) => ({
          hex: c.hex,
          stimulus: c.stimulus,
          reaction: GESTURES[c.reaction],
        }))
      : [];
  return { appetite: seen, cues };
};

/** The first material (in content order) with this tag that a pack or the stores hold. */
export const firstWithTag = (materials: Materials, tag: string, amount = 1): string | null =>
  MATERIALS.find((m) => m.tags.includes(tag) && (materials[m.id] ?? 0) >= amount)?.id ?? null;

/** Satiety one unit of a material adds (0 for anything not food). */
export const nourishment = (materialId: string): number => {
  const m = MATERIALS.find((x) => x.id === materialId);
  return m?.tags.includes(FOOD_TAG) ? (m.nourishes ?? 0) : 0;
};
