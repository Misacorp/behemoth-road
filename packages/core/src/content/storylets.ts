/**
 * Storylets, as data: moments of story that fire once, when public facts say so. A storylet has an id
 * (the text is the interface's, keyed by it), a kind, the conditions that must all hold, who it is for,
 * and what it is anchored to on the map. Conditions are a closed union over public facts only (what
 * every player can see in `GameStateView`): never the seed, the creature's nature or care, or a hidden
 * feature. `docs/design/story.md` has the contract.
 */

/** A condition over public facts. Add a kind here and in `story.ts`'s `holds`, never read anything else. */
export type Condition =
  /** The creature's steps are at least this fraction of the route's length (0: setting out). */
  | { readonly kind: 'route'; readonly fraction: number }
  /** The creature's footprint touches a tile whose terrain has this tag (anchor: that hex). */
  | { readonly kind: 'footprint-touches'; readonly tag: string }
  /** A threat whose type has this `ending` is on the map (anchor: its hex). */
  | { readonly kind: 'threat-ending'; readonly ending: 'pursuer' }
  /** A settlement is in view (anchor: its hex). */
  | { readonly kind: 'settlement-in-view' };

/** `beat`: a card that passes during the season. `ending`: shown when it is over (chosen by `endingOf`, not fired). */
export type StoryKind = 'beat' | 'ending';

export interface Storylet {
  readonly id: string;
  readonly kind: StoryKind;
  /** All must hold. */
  readonly when: readonly Condition[];
  /** Who it is for: everyone, for now. */
  readonly audience: 'all';
  /** Fires at most once a season. */
  readonly once: true;
  /** `hex`: drawn on the hex a condition names (the first of the conditions that gives one). */
  readonly anchor: 'creature' | 'hex';
}

const beat = (
  id: string,
  when: readonly Condition[],
  anchor: Storylet['anchor'] = 'creature',
): Storylet => ({ id, kind: 'beat', when, audience: 'all', once: true, anchor });

/** Season one: twelve beats, in the order a tie is released. */
export const STORYLETS: readonly Storylet[] = [
  beat('beat.setting-out', [{ kind: 'route', fraction: 0 }]),
  beat('beat.terrain.wooded', [{ kind: 'footprint-touches', tag: 'wooded' }], 'hex'),
  beat('beat.terrain.dry', [{ kind: 'footprint-touches', tag: 'dry' }], 'hex'),
  beat('beat.terrain.steep', [{ kind: 'footprint-touches', tag: 'steep' }], 'hex'),
  beat('beat.terrain.water', [{ kind: 'footprint-touches', tag: 'water' }], 'hex'),
  beat('beat.terrain.boggy', [{ kind: 'footprint-touches', tag: 'boggy' }], 'hex'),
  beat('beat.first.captors', [{ kind: 'threat-ending', ending: 'pursuer' }], 'hex'),
  beat('beat.first.settlement', [{ kind: 'settlement-in-view' }], 'hex'),
  beat('beat.waymark.quarter', [{ kind: 'route', fraction: 0.25 }]),
  beat('beat.waymark.half', [{ kind: 'route', fraction: 0.5 }]),
  beat('beat.waymark.three-quarters', [{ kind: 'route', fraction: 0.75 }]),
  beat('beat.greyfold', [{ kind: 'route', fraction: 0.9 }]),
];
