/**
 * What the guided day lights on the map (`coach.ts` says what): glowing hexes, a ring round your own
 * character and a ghost hand that taps. Drawn into the map's world SVG, so it pans and zooms with the map;
 * the pulse and the tap are CSS animations (`onboarding.css`), no per-frame renders. It takes no pointer:
 * every tap goes through to the map as usual.
 */
import { hexCenter, hexCorners } from '@behemoth-road/art';
import type { GameStateView, Hex } from '@behemoth-road/core';
import type { JSX } from 'preact';
import { figureFeet } from '../map/figures.ts';
import { PROJECTION } from '../map/art.ts';
import type { CoachMap } from './coach.ts';

const p = PROJECTION;
const n = (v: number): string => (Math.round(v * 10) / 10).toString();

/** A hex's outline as path data (a little inside its edge, like the map's own outlines). */
export function hexOutline(h: Hex, scale = 0.9): string {
  const pts = hexCorners(p, hexCenter(p, h.q, h.r), scale);
  return `M${pts.map((q) => `${n(q.x)} ${n(q.y)}`).join('L')}Z`;
}

/** The ghost hand: a pointing hand in ink, its fingertip at the origin. */
function Hand({ x, y, k }: { x: number; y: number; k: number }): JSX.Element {
  return (
    <g
      class="coach-hand"
      aria-hidden="true"
      transform={`translate(${n(x)} ${n(y)}) scale(${k.toFixed(2)})`}
    >
      <g class="coach-hand-tap">
        <path
          class="coach-hand-shape"
          d="M0 0C-1.6 0-2.6 1-2.6 2.4V13L-6 10.2C-7.4 9-9.4 10.2-8.6 11.8L-3 21C-1.4 24 1 25.4 4 25.4H8C11.8 25.4 14 22.8 14 19V10C14 8.4 12.8 7.6 11.6 7.6C10.6 7.6 10 8 9.6 8.6C9.4 7.6 8.6 6.8 7.4 6.8C6.4 6.8 5.6 7.4 5.2 8.2C4.8 7.2 4 6.6 2.8 6.6V2.4C2.8 1 1.6 0 0 0Z"
        />
        <ellipse class="coach-hand-ripple" cx="0" cy="0" rx="9" ry="9" />
      </g>
    </g>
  );
}

export function CoachLayer({
  coach,
  state,
  characterId,
  ink,
}: {
  coach: CoachMap;
  state: GameStateView;
  characterId: string;
  /** World px per drawn px so strokes read the same at any zoom (the map's `max(k, k / inkZoom)`). */
  ink: number;
}): JSX.Element | null {
  const feet = coach.ringMe ? figureFeet(state, characterId, p) : null;
  const hand = coach.hand ? hexCenter(p, coach.hand.q, coach.hand.r) : null;
  if (coach.glow.length === 0 && !feet && !hand) return null;
  return (
    <g class="coach-layer" data-step={coach.step} pointer-events="none" aria-hidden="true">
      {coach.glow.length > 0 && (
        <path
          class="coach-glow"
          d={coach.glow.map((h) => hexOutline(h)).join('')}
          stroke-width={n(3 * ink)}
        />
      )}
      {feet && (
        <ellipse
          class="coach-ring"
          cx={n(feet.x)}
          cy={n(feet.y - 0.1 * p.size)}
          rx={n(0.55 * p.size)}
          ry={n(0.55 * p.size * p.squash)}
          stroke-width={n(3 * ink)}
        />
      )}
      {hand && <Hand x={hand.x} y={hand.y} k={0.9 * ink} />}
    </g>
  );
}
