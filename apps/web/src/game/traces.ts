/**
 * Traces and waymarks on the map: which trace a hex shows, the tip it opens (the text from `text/tips.ts`,
 * who and which step as plain text under it), and where the standing stones are. Pure and tested.
 * Traces come from `game.traces` and change no rule; the stones follow the quarter, half and
 * three-quarter beats of `game.story.fired`.
 */
import type { GameStateView, Hex, Trace, TraceKind } from '@behemoth-road/core';
import { hexKey } from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';

/** When several traces share a hex, the one that tells most shows first (a trail is the least). */
const PRIORITY: readonly TraceKind[] = ['gate', 'chain', 'cairn', 'fire', 'trail'];

const TRACE_TIPS: Readonly<Record<TraceKind, TipId>> = {
  fire: 'map:trace-fire',
  trail: 'map:trace-trail',
  cairn: 'map:trace-cairn',
  chain: 'map:trace-chain',
  gate: 'map:trace-gate',
};

/** Every trace on a hex, the most telling first. */
export const tracesAt = (state: GameStateView, hex: Hex): Trace[] =>
  state.traces
    .filter((t) => t.hex.q === hex.q && t.hex.r === hex.r)
    .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));

export interface TraceTip {
  readonly id: TipId;
  /** The character it is credited to, by name, or null (a trail has no one). */
  readonly who: string | null;
  /** The creature's step it was made at. */
  readonly step: number;
}

/** The tip a hex's trace opens, with who and which step; null where there is no trace. */
export function traceTipAt(
  state: GameStateView,
  hex: Hex,
  nameOf: (characterId: string) => string | null,
): TraceTip | null {
  const t = tracesAt(state, hex)[0];
  if (!t) return null;
  return { id: TRACE_TIPS[t.kind], who: t.by ? nameOf(t.by) : null, step: t.step };
}

/** The route's waymark beats, with the scratches on each stone. */
export const WAYMARKS = [
  { id: 'beat.waymark.quarter', fraction: 0.25, ticks: 1 },
  { id: 'beat.waymark.half', fraction: 0.5, ticks: 2 },
  { id: 'beat.waymark.three-quarters', fraction: 0.75, ticks: 3 },
] as const;

export interface Stone {
  readonly id: string;
  readonly hex: Hex;
  readonly ticks: number;
}

/**
 * The standing stones set so far. A stone stands where the creature was at the step its beat fired: a trail
 * the footprint left then, else (the trail may be gone) the creature's own hex while it is still at that
 * step, else nowhere. Where a stone was once found it is remembered in `memory` (which the caller keeps),
 * so it stays when its trail is pruned. A stone on a hex no longer on the map is not drawn.
 */
export function standingStones(state: GameStateView, memory: Map<string, Hex>): readonly Stone[] {
  const out: Stone[] = [];
  const fired = new Set(state.story.fired);
  for (const w of WAYMARKS) {
    if (!fired.has(w.id)) continue;
    const step = Math.ceil(w.fraction * state.config.routeLength);
    let hex = memory.get(w.id) ?? null;
    if (!hex) {
      hex =
        state.traces.find((t) => t.kind === 'trail' && t.step === step)?.hex ??
        (state.creature.steps - step <= 1 ? state.creature.centre : null);
      if (hex) memory.set(w.id, hex);
    }
    if (hex && state.tiles[hexKey(hex)]) out.push({ id: w.id, hex, ticks: w.ticks });
  }
  return out;
}
