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

/** A card is read once the player closes it, or after it has been up this long (ms). */
export const READ_AFTER_MS = 1500;

export interface StoryModel {
  /** Every unread id already noticed, so only a new arrival may play by itself. */
  readonly known: readonly string[];
  /** Ids read this session (closed by a tap, or up long enough), possibly not yet echoed by the server. */
  readonly shown: readonly string[];
  readonly playing: (StoryCard & { readonly at: number }) | null;
  /** Something has been noticed once: later arrivals are "late", not "on load". */
  readonly loaded: boolean;
}

export const NO_STORY: StoryModel = { known: [], shown: [], playing: null, loaded: false };

/** The card the model shows, without its start time. */
export const cardOf = (m: StoryModel): StoryCard | null =>
  m.playing ? { id: m.playing.id, anchor: m.playing.anchor } : null;

/** The ids to read, in the order they fired: fired, not read, not read this session, with text in this build. */
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

export interface Step {
  readonly model: StoryModel;
  /** A card that starts to play. */
  readonly started: string | null;
  /** A card now counted read (to send to the server). */
  readonly read: string | null;
}

const start = (
  m: StoryModel,
  id: string,
  anchors: ReadonlyMap<string, CardAnchor>,
  now: number,
): Step => ({
  model: { ...m, loaded: true, playing: { id, anchor: anchors.get(id) ?? CREATURE, at: now } },
  started: id,
  read: null,
});

const counted = (m: StoryModel): Step => {
  const p = m.playing;
  if (!p) return { model: m, started: null, read: null };
  const fresh = !m.shown.includes(p.id);
  return {
    model: { ...m, shown: fresh ? [...m.shown, p.id] : m.shown, playing: null },
    started: null,
    read: fresh ? p.id : null,
  };
};

/**
 * A new view: `unread` is `unreadOf` for it. A card plays by itself only if it is new to the player (not yet
 * noticed), nothing is playing, and the map is `free`. On load the oldest unread plays; a late arrival plays
 * the newest one that arrived. While not free nothing is noticed, so a card still gets its turn.
 */
export function arrive(
  m: StoryModel,
  unread: readonly string[],
  anchors: ReadonlyMap<string, CardAnchor>,
  free: boolean,
  now: number,
): Step {
  const none: Step = { model: m, started: null, read: null };
  if (!free) return none;
  const fresh = unread.filter((id) => !m.known.includes(id));
  const known = [...new Set([...m.known, ...unread])];
  if (fresh.length === 0 || m.playing !== null) {
    return { ...none, model: known.length === m.known.length ? m : { ...m, known } };
  }
  const id = m.loaded ? fresh[fresh.length - 1]! : fresh[0]!;
  return start({ ...m, known }, id, anchors, now);
}

/** The badge was tapped: the oldest unread card plays (nothing happens while one is showing). */
export function tapBadge(
  m: StoryModel,
  unread: readonly string[],
  anchors: ReadonlyMap<string, CardAnchor>,
  now: number,
): Step {
  if (m.playing !== null || unread.length === 0) return { model: m, started: null, read: null };
  return start(m, unread[0]!, anchors, now);
}

/** The next tap anywhere closes the card, and it counts as read. */
export const closeByTap = (m: StoryModel): Step => counted(m);

/** The card has been up long enough: it counts as read (and stays up until closed). */
export function settle(m: StoryModel, now: number): Step {
  const p = m.playing;
  if (!p || m.shown.includes(p.id) || now - p.at < READ_AFTER_MS) {
    return { model: m, started: null, read: null };
  }
  return { model: { ...m, shown: [...m.shown, p.id] }, started: null, read: p.id };
}

/**
 * The map stopped being free (a view, a moment, a step, a drawer) and the card is taken down. If it was up
 * long enough it counts as read; otherwise it goes back to unread for this session and plays again once the
 * map is free.
 */
export function closeByLoss(m: StoryModel, now: number): Step {
  const p = m.playing;
  if (!p) return { model: m, started: null, read: null };
  if (m.shown.includes(p.id) || now - p.at >= READ_AFTER_MS) return counted(m);
  return {
    model: { ...m, playing: null, known: m.known.filter((id) => id !== p.id) },
    started: null,
    read: null,
  };
}

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
