/**
 * Moments: short visual beats on the map, with no prose. A hex explored (its veil lifts), a survey, a reveal
 * (an ink bloom), a find (the material's icon rising from the site), a sprung trap (a snap; your pips go dark
 * when it caught you), a deposit into the stores and a finished unlock (on the creature), and Milestone 4's
 * fire lit, fire gone out, feeding, a linger, a starving creature eating from the stores, and the day's step
 * (the creature walking to its new centre, or a clear mark that it stayed). They come only from
 * the server's events (your own move or action, and the log of what others and the tick did since your last
 * view), so they show for anything that happened, whoever did it. They are CSS animations (no per-frame
 * renders) and end by themselves.
 */
import type { Hex } from '@behemoth-road/core';

export type Moment =
  | { readonly kind: 'explore'; readonly hex: Hex }
  | { readonly kind: 'survey'; readonly hex: Hex }
  /** A survey (or a step) that found nothing: the empty mark settles on the hex. */
  | { readonly kind: 'nothing-here'; readonly hex: Hex }
  | { readonly kind: 'reveal'; readonly hex: Hex }
  | { readonly kind: 'find'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'trap'; readonly hex: Hex; readonly mine: boolean }
  | { readonly kind: 'deposit'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'unlock'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'fire'; readonly hex: Hex }
  | { readonly kind: 'fire-out'; readonly hex: Hex }
  | { readonly kind: 'feed'; readonly hex: Hex; readonly item: string | null }
  | { readonly kind: 'linger'; readonly hex: Hex }
  | { readonly kind: 'ate'; readonly hex: Hex; readonly item: string }
  // Milestone 5.
  | { readonly kind: 'threat'; readonly hex: Hex }
  /** A threat struck the creature: the peril gauge jolts. */
  | { readonly kind: 'strike'; readonly hex: Hex }
  | { readonly kind: 'struck'; readonly hex: Hex; readonly mine: boolean }
  | { readonly kind: 'hit'; readonly hex: Hex }
  | { readonly kind: 'cleared'; readonly hex: Hex }
  | { readonly kind: 'defend'; readonly hex: Hex }
  | { readonly kind: 'befriended'; readonly hex: Hex }
  | { readonly kind: 'angered'; readonly hex: Hex }
  | { readonly kind: 'boon'; readonly hex: Hex; readonly item: string }
  | { readonly kind: 'season-over'; readonly hex: Hex }
  /** A pursuer led away by a mislead: it turns and goes where it stood. */
  | { readonly kind: 'misled'; readonly hex: Hex }
  /** Peril dropped (a shelter): a soft bloom on the creature, and the gauge swells. */
  | { readonly kind: 'relieved'; readonly hex: Hex }
  /** A character left out of reach: its figure fades into the fog where it stood. */
  | {
      readonly kind: 'lost';
      readonly hex: Hex;
      readonly characterId: string;
      readonly mine: boolean;
    }
  /** The creature's daily step: it walks from one hex to the next while the camera holds still. */
  | { readonly kind: 'step'; readonly hex: Hex; readonly from: Hex }
  /** The day's step when it lingered: it stayed where it was. */
  | { readonly kind: 'stayed'; readonly hex: Hex };

/** How long a moment stays on screen, in ms (its CSS animation is as long). */
export const MOMENT_MS = 1400;
/** The creature's walk of one hex, in ms; the camera follows after it. */
export const STEP_MS = 1200;
/** Your character fading into the fog, in ms, before the join drawer opens. */
export const LOST_MS = 2200;

/** How long a set of moments stays on screen: the longest of them. */
export const momentsMs = (moments: readonly Moment[]): number =>
  Math.max(
    0,
    ...moments.map((m) => (m.kind === 'lost' ? LOST_MS : m.kind === 'step' ? STEP_MS : MOMENT_MS)),
  );

/** The part of an event the moments read (the core's `GameEvent`, as parsed). */
export interface EventLike {
  readonly kind: string;
  readonly characterId?: string | undefined;
  readonly hex?: Hex | undefined;
  readonly material?: string | undefined;
  readonly unlock?: string | undefined;
  readonly materials?: Readonly<Record<string, number>> | undefined;
  /** Milestone 5: the threat or settlement it is about, and a boon. */
  readonly id?: string | undefined;
  readonly boon?: string | undefined;
  /** A creature step's start and end; peril before and after. */
  readonly from?: Hex | number | undefined;
  readonly to?: Hex | number | undefined;
}

/** The new event the core may send for a survey that found nothing (instead of a survey without a reveal). */
const SURVEY_EMPTY = 'survey-empty';

/** Hexes surveyed in these events where nothing was revealed. */
function emptySurveys(events: readonly EventLike[]): Set<string> {
  const revealed = new Set<string>();
  for (const e of events) if (e.kind === 'reveal' && e.hex) revealed.add(`${e.hex.q},${e.hex.r}`);
  const out = new Set<string>();
  for (const e of events) {
    if ((e.kind === 'survey' || e.kind === SURVEY_EMPTY) && e.hex) {
      const k = `${e.hex.q},${e.hex.r}`;
      if (!revealed.has(k)) out.add(k);
    }
  }
  return out;
}

/**
 * Where Milestone 5's events happened, for those that name a thing rather than a hex: a threat (one cleared
 * or spent is gone from the new view, so the view before it is asked too), a settlement, a character.
 */
export interface Whereabouts {
  readonly threat: (id: string) => Hex | null;
  readonly settlement: (id: string) => Hex | null;
  readonly character: (id: string) => Hex | null;
}

const NOWHERE: Whereabouts = {
  threat: () => null,
  settlement: () => null,
  character: () => null,
};

/** The material there is most of, if any. */
function most(materials: Readonly<Record<string, number>>): string | null {
  let best: string | null = null;
  let top = 0;
  for (const [id, n] of Object.entries(materials)) if (n > top) [best, top] = [id, n];
  return best;
}

/**
 * Moments from server events, in order. `centre` is where the creature stands (deposits, unlocks, feeding,
 * a linger and the creature eating show there); `me` is your character (a trap that caught it darkens your
 * pips). The day's step is a walk, or a stayed mark when it lingered (`from` equals `to`). Kinds without a
 * moment (gather, a failed site, unlock progress) and unknown kinds are skipped, so new events never break
 * the map.
 */
export function momentsFromEvents(
  events: readonly EventLike[],
  centre: Hex,
  me: string,
  where: Whereabouts = NOWHERE,
): Moment[] {
  const out: Moment[] = [];
  const thing = (kind: 'threat' | 'settlement', id: string | undefined): Hex | null =>
    id === undefined ? null : where[kind](id);
  const empty = emptySurveys(events);
  let misleading = false;
  for (const e of events) {
    if (e.kind === 'boon' && e.boon === 'mislead') misleading = true;
    if (e.kind === 'threat-gone') {
      // Led away by the mislead just asked for: it turns and goes.
      const hex = misleading ? thing('threat', e.id) : null;
      if (hex) out.push({ kind: 'misled', hex });
      continue;
    }
    if (e.kind === 'peril') {
      if (typeof e.from === 'number' && typeof e.to === 'number' && e.to < e.from) {
        out.push({ kind: 'relieved', hex: centre });
      }
      continue;
    }
    if ((e.kind === 'survey' || e.kind === SURVEY_EMPTY) && e.hex) {
      const k = `${e.hex.q},${e.hex.r}`;
      out.push(
        empty.has(k) ? { kind: 'nothing-here', hex: e.hex } : { kind: 'survey', hex: e.hex },
      );
      empty.delete(k);
      continue;
    }
    const m5 = seasonMoment(e, centre, me, where, thing);
    if (m5 !== undefined) {
      if (m5) out.push(m5);
      continue;
    }
    if (e.kind === 'creature-step' && typeof e.from === 'object' && typeof e.to === 'object') {
      const stayed = e.from.q === e.to.q && e.from.r === e.to.r;
      out.push(stayed ? { kind: 'stayed', hex: e.to } : { kind: 'step', hex: e.to, from: e.from });
    } else if (e.kind === 'fed') {
      out.push({ kind: 'feed', hex: centre, item: e.material ?? null });
    } else if (e.kind === 'linger') {
      out.push({ kind: 'linger', hex: centre });
    } else if (e.kind === 'creature-ate' && e.material) {
      out.push({ kind: 'ate', hex: centre, item: e.material });
    } else if (e.kind === 'deposit' && e.materials) {
      const item = most(e.materials);
      if (item) out.push({ kind: 'deposit', hex: centre, item });
    } else if (e.kind === 'lost' && e.hex && e.characterId) {
      out.push({
        kind: 'lost',
        hex: e.hex,
        characterId: e.characterId,
        mine: e.characterId === me,
      });
    } else if (e.kind === 'unlock-done' && e.unlock) {
      out.push({ kind: 'unlock', hex: centre, item: e.unlock });
    } else if (!e.hex) {
      continue;
    } else if (e.kind === 'explore' || e.kind === 'reveal') {
      out.push({ kind: e.kind, hex: e.hex });
    } else if (e.kind === 'trap') {
      out.push({ kind: 'trap', hex: e.hex, mine: e.characterId === me });
    } else if (e.kind === 'fire-lit') {
      out.push({ kind: 'fire', hex: e.hex });
    } else if (e.kind === 'fire-out') {
      out.push({ kind: 'fire-out', hex: e.hex });
    } else if (e.kind === 'find' && e.material) {
      out.push({ kind: 'find', hex: e.hex, item: e.material });
    }
  }
  return out;
}

/**
 * Milestone 5's moments: undefined for an event that is not one of its kinds, null for one of them that
 * cannot be placed (or has no moment).
 */
function seasonMoment(
  e: EventLike,
  centre: Hex,
  me: string,
  where: Whereabouts,
  thing: (kind: 'threat' | 'settlement', id: string | undefined) => Hex | null,
): Moment | null | undefined {
  const at = (hex: Hex | null | undefined, make: (h: Hex) => Moment): Moment | null =>
    hex ? make(hex) : null;
  switch (e.kind) {
    case 'threat-appears':
      return at(e.hex ?? thing('threat', e.id), (hex) => ({ kind: 'threat', hex }));
    case 'threat-strikes':
      return { kind: 'strike', hex: centre };
    case 'struck':
      return at(e.characterId ? where.character(e.characterId) : null, (hex) => ({
        kind: 'struck',
        hex,
        mine: e.characterId === me,
      }));
    case 'threat-hit':
      return at(thing('threat', e.id), (hex) => ({ kind: 'hit', hex }));
    case 'threat-cleared':
      return at(thing('threat', e.id), (hex) => ({ kind: 'cleared', hex }));
    case 'defend':
      return { kind: 'defend', hex: centre };
    case 'befriended':
      return at(thing('settlement', e.id), (hex) => ({ kind: 'befriended', hex }));
    case 'angered':
      return at(thing('settlement', e.id), (hex) => ({ kind: 'angered', hex }));
    case 'boon':
      return at(thing('settlement', e.id), (hex) => ({ kind: 'boon', hex, item: e.boon ?? '' }));
    case 'season-over':
      return { kind: 'season-over', hex: centre };
    case 'threat-moves':
    case 'settlement-appears':
    case 'parley':
    case 'offer':
      return null;
    default:
      return undefined;
  }
}

/** A key per event, for playing each once: its version and its place among that version's events. */
export function eventKeys(events: readonly { readonly version: number }[]): string[] {
  const seen = new Map<number, number>();
  return events.map((e) => {
    const i = seen.get(e.version) ?? 0;
    seen.set(e.version, i + 1);
    return `${String(e.version)}:${String(i)}`;
  });
}
