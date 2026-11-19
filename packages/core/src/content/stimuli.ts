/**
 * Stimuli: things characters set out on the map that the creature reacts to.
 * The creature's reaction is looked up by the stimulus's tags. Rules read tags
 * and properties, never ids.
 */

export interface StimulusType {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  /** Taken from the lighting character's own pack: `amount` units of a material with this tag. */
  readonly fuel: { readonly tag: string; readonly amount: number };
  /** Ticks it lasts: 1 means it acts on the tick that ends the day it was set, then is gone. */
  readonly lastsTicks: number;
  /** Terrain tags it cannot be set on. */
  readonly notOn: readonly string[];
}

export const STIMULUS_TYPES: readonly StimulusType[] = [
  {
    id: 'fire',
    name: 'Fire',
    tags: ['fire', 'heat', 'light'],
    icon: 'campfire',
    fuel: { tag: 'wood', amount: 1 },
    lastsTicks: 1,
    notOn: ['water'],
  },
];
