/** Full-page states before the game: outside Discord, and a failed start. Visual only, no prose. */
import type { JSX } from 'preact';
import { drawCreatureIcon, GENTLE_AMBLER } from '@behemoth-road/art';
import { toPreact } from '../map/svgToPreact.ts';
import { PALETTE } from '../map/art.ts';

/** The creature at page size, with ink chosen for 96 px (the art kit's size-aware icon). */
const BIG_CREATURE = toPreact(drawCreatureIcon(PALETTE, GENTLE_AMBLER, 96));

const line = {
  fill: 'none',
  stroke: PALETTE.ink,
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

/** Outside Discord: the creature beside a door with an arrow going in (the game opens from Discord). */
export function OpenFromDiscord(): JSX.Element {
  return (
    <main class="state" data-state="outside" aria-label="Open from Discord">
      <div class="state-art">
        <span class="state-creature">{BIG_CREATURE}</span>
        <svg viewBox="0 0 64 64" class="state-door" aria-hidden="true">
          <path d="M18 58V10h28v48" {...line} fill={PALETTE.paperDeep} />
          <path d="M8 58h48" {...line} />
          <circle cx={40} cy={36} r={2} fill={PALETTE.ink} />
          <path d="M-10 34h22M6 28l6 6-6 6" {...line} stroke-dasharray="4 4" />
        </svg>
      </div>
    </main>
  );
}

/** The start failed (network, server): a torn mark and a retry button. */
export function StartFailed({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <main class="state" data-state="failed">
      <svg viewBox="0 0 64 64" class="state-mark" aria-hidden="true">
        <path d="M14 10h36v44H14Z" {...line} fill={PALETTE.paperDeep} />
        <path d="M14 30l8 4 6-6 8 6 6-4 8 4" {...line} />
      </svg>
      <button type="button" class="round" aria-label="Retry" onClick={onRetry}>
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M24.5 11.5A10 10 0 1 0 26 18" {...line} />
          <path d="M25.5 5.5v6.5H19" {...line} />
        </svg>
      </button>
    </main>
  );
}
