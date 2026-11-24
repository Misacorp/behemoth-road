/**
 * Story cards: the model behind the passing card and the small story badge. Pure and tested.
 *
 * The unread cards are `game.story.fired` minus what you have read (`you.storyRead`) and what has played
 * this session, in firing order. That is the truth even for the opening beats, which a new game fires at
 * creation without an event; events only tell where a card is anchored (else it is the creature's).
 *
 * On load one unread card plays (the oldest). The rest wait behind the badge and play one at a time on later
 * taps of it (no list). A card that arrives later (a poll, the live socket) plays at once only when nothing
 * is playing and the map is free (no popover or drawer open); otherwise it joins the badge. A card is marked
 * read when it starts to play. Nothing here runs in the practice map.
 */
import type { Hex } from '@behemoth-road/core';
import { beatText } from '../text/story.ts';

export type CardAnchor =
  { readonly kind: 'creature' } | { readonly kind: 'hex'; readonly hex: Hex };

export interface StoryCard {
  readonly id: string;
  readonly anchor: CardAnchor;
}

export interface StoryModel {
  /** Every unread id already noticed, so only a new arrival may play by itself. */
  readonly known: readonly string[];
  /** Ids that have played this session (marked read, possibly not yet echoed back by the server). */
  readonly shown: readonly string[];
  readonly playing: StoryCard | null;
}

export const NO_STORY: StoryModel = { known: [], shown: [], playing: null };

/** The ids to read, in the order they fired: fired, not read, not played, and with text in this build. */
export const unreadOf = (
  fired: readonly string[],
  read: readonly string[],
  shown: readonly string[],
): string[] =>
  fired.filter((id) => !read.includes(id) && !shown.includes(id) && beatText(id) !== null);

/** Where each story event placed its card (the latest event for an id wins). */
export function anchorsOf(
  events: readonly {
    readonly kind: string;
    readonly id?: string | undefined;
    readonly anchor?: CardAnchor | undefined;
  }[],
  into: Map<string, CardAnchor> = new Map(),
): Map<string, CardAnchor> {
  for (const e of events) if (e.kind === 'story' && e.id && e.anchor) into.set(e.id, e.anchor);
  return into;
}

const CREATURE: CardAnchor = { kind: 'creature' };

const start = (
  m: StoryModel,
  id: string,
  anchors: ReadonlyMap<string, CardAnchor>,
): StoryModel => ({
  ...m,
  shown: [...m.shown, id],
  playing: { id, anchor: anchors.get(id) ?? CREATURE },
});

/**
 * A new view: `unread` is `unreadOf` for it. A card plays by itself only if it is new to the player (not yet
 * noticed), nothing is playing, and the map is `free`. While not free nothing is noticed, so the card
 * still gets its turn when the map clears.
 */
export function arrive(
  m: StoryModel,
  unread: readonly string[],
  anchors: ReadonlyMap<string, CardAnchor>,
  free: boolean,
): { readonly model: StoryModel; readonly started: string | null } {
  if (!free) return { model: m, started: null };
  const fresh = unread.some((id) => !m.known.includes(id));
  const known = [...new Set([...m.known, ...unread])];
  if (!fresh || m.playing !== null || unread.length === 0) {
    return { model: known.length === m.known.length ? m : { ...m, known }, started: null };
  }
  const id = unread[0]!;
  return { model: start({ ...m, known }, id, anchors), started: id };
}

/** The badge was tapped: the oldest unread card plays (nothing happens while one is showing). */
export function tapBadge(
  m: StoryModel,
  unread: readonly string[],
  anchors: ReadonlyMap<string, CardAnchor>,
): { readonly model: StoryModel; readonly started: string | null } {
  if (m.playing !== null || unread.length === 0) return { model: m, started: null };
  const id = unread[0]!;
  return { model: start(m, id, anchors), started: id };
}

/** The next tap anywhere closes the card. */
export const closeCard = (m: StoryModel): StoryModel =>
  m.playing === null ? m : { ...m, playing: null };

/** The badge shows while cards wait and none is playing. */
export const badgeShown = (m: StoryModel, unread: readonly string[]): boolean =>
  m.playing === null && unread.length > 0;

/** The server takes at most this many ids in one read call. */
export const READ_BATCH = 12;

/** Ids in calls of at most `READ_BATCH`, each id once. */
export function readBatches(ids: readonly string[]): string[][] {
  const unique = [...new Set(ids)];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += READ_BATCH) out.push(unique.slice(i, i + READ_BATCH));
  return out;
}
