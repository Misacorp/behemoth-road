/**
 * The "while you were away" recap, for the first open after at least one day turned since your last visit:
 * the days that passed, what happened near the creature (marks, from the event log since your last visit,
 * `GET /api/game?since=`), and where peril and the route stand now. Everything in it is already public in
 * the view and the log, so it reveals nothing new. These are the pure rules; `WelcomeBack.tsx` draws it.
 */
import type { GameEvent, PlayerView } from '../api/schema.ts';
import { type Moment, momentsFromEvents } from '../game/moments.ts';

/** The most day cells shown (the last ones; a longer absence starts with a gap). */
export const MAX_DAYS = 5;
/** The most kinds of mark shown. */
export const MAX_MARKS = 6;

/** The moments that read as "something happened near the creature", in the order they are shown. */
export const MARK_KINDS = [
  'threat',
  'strike',
  'trap',
  'hungry',
  'find',
  'reveal',
  'fire',
  'cleared',
  'befriended',
  'angered',
] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface Mark {
  readonly kind: MarkKind;
  readonly count: number;
}

export interface Welcome {
  /** The last `MAX_DAYS` days from your last visit's to today's (the last is today), and whether earlier ones were left out. */
  readonly days: readonly number[];
  readonly gap: boolean;
  /** How many days turned while you were away. */
  readonly dusks: number;
  /** What happened, by kind (empty when the log no longer holds it, or nothing did). */
  readonly marks: readonly Mark[];
  readonly peril: number;
  readonly perilMax: number;
  readonly perilWoundedAt: number;
  readonly steps: number;
  readonly routeLength: number;
}

/**
 * Whether to recap on this open: you have a character, you have been here before, and at least one day
 * turned since. A first visit (no last day) and the same day again show nothing.
 */
export function welcomeNeeded(view: PlayerView): boolean {
  const { lastDay, characterId } = view.you;
  return characterId !== null && lastDay !== null && view.day > lastDay;
}

/** The count of each mark kind in a log of moments, in `MARK_KINDS` order, the most `MAX_MARKS`. */
export function marksOf(moments: readonly Moment[]): Mark[] {
  const counts = new Map<MarkKind, number>();
  for (const m of moments) {
    const kind = (MARK_KINDS as readonly string[]).includes(m.kind) ? (m.kind as MarkKind) : null;
    if (kind !== null) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return MARK_KINDS.flatMap((kind) => {
    const count = counts.get(kind);
    return count === undefined ? [] : [{ kind, count }];
  }).slice(0, MAX_MARKS);
}

/**
 * The recap for a view, with the events since the last visit (from the log; none when it was truncated or
 * could not be read).
 */
export function welcomeOf(
  view: PlayerView,
  events: readonly GameEvent[],
  truncated: boolean,
): Welcome {
  const last = view.you.lastDay ?? view.day;
  const from = Math.max(last, view.day - (MAX_DAYS - 1));
  const days = Array.from({ length: view.day - from + 1 }, (_, i) => from + i);
  const { game } = view;
  const moments = truncated
    ? []
    : momentsFromEvents(
        events,
        game.creature.centre,
        view.you.characterId ?? '',
        // Things that are gone by now (a cleared threat) have no place to show: they are left out.
        {
          threat: (id) => game.threats.find((t) => t.id === id)?.hex ?? null,
          settlement: (id) => game.settlements.find((x) => x.id === id)?.hex ?? null,
          character: () => game.creature.centre,
        },
      );
  return {
    days,
    gap: from > last,
    dusks: Math.max(0, view.day - last),
    marks: marksOf(moments),
    peril: game.peril,
    perilMax: game.config.perilMax,
    perilWoundedAt: game.config.perilWoundedAt,
    steps: game.creature.steps,
    routeLength: game.config.routeLength,
  };
}
