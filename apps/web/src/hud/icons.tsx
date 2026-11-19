/**
 * Interface icons in the ink style, drawn as SVG from palette colours. The character and creature icons
 * are the art kit's own figures, mapped through the same allowlisted mapper as the map.
 */
import {
  accentRamp,
  drawCharacter,
  drawCreature,
  GENTLE_AMBLER,
  type Drawn,
} from '@behemoth-road/art';
import type { JSX } from 'preact';
import { PALETTE } from '../map/art.ts';
import { MAP_TUNING } from '../map/config.ts';
import { toPreact } from '../map/svgToPreact.ts';

const ink = PALETTE.ink;
const line = {
  fill: 'none',
  stroke: ink,
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

function figure(drawn: Drawn, pad: number): JSX.Element {
  const { x0, y0, x1, y1 } = drawn.box;
  const w = x1 - x0 + pad * 2;
  const h = y1 - y0 + pad * 2;
  const side = Math.max(w, h);
  const x = x0 - pad - (side - w) / 2;
  const y = y0 - pad - (side - h) / 2;
  return (
    <svg viewBox={`${x} ${y} ${side} ${side}`} aria-hidden="true">
      {drawn.nodes.map(toPreact)}
    </svg>
  );
}

// Ink widths in drawing units, picked so lines read about 1.2 px at the button's size.
const CHARACTER = drawCharacter(PALETTE, MAP_TUNING.accent, { x: 0, y: 0 }, 40, 0.6, 1.3);
const CREATURE = drawCreature(PALETTE, GENTLE_AMBLER, { x: 0, y: 0 }, 14, 0.6, 1.8, 'right');

export const CharacterIcon = (): JSX.Element => figure(CHARACTER, 2);
export const CreatureIcon = (): JSX.Element => figure(CREATURE, 2);

/** The sun over the horizon: the day counter's mark. */
export function SunIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 21a8 8 0 0 1 16 0Z" {...line} fill={PALETTE.accents.ochre.light} />
      <path d="M4 24h24M16 7v3M7 12l2 2M25 12l-2 2" {...line} />
    </svg>
  );
}

/** Next day: the sun with an arrow onwards. */
export function NextDayIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 21a7 7 0 0 1 14 0Z" {...line} fill={PALETTE.accents.ochre.light} />
      <path d="M3 24h18M21 14h8M25 10l4 4-4 4" {...line} />
    </svg>
  );
}

/** New game: a circling arrow. */
export function NewGameIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M24.5 11.5A10 10 0 1 0 26 18" {...line} />
      <path d="M25.5 5.5v6.5H19" {...line} />
    </svg>
  );
}

/** Confirm: a tick in a filled accent disc. */
export function TickMark({ r }: { r: number }): JSX.Element {
  const s = r / 22;
  return (
    <g>
      <circle
        r={r}
        fill={accentRamp(PALETTE, MAP_TUNING.accent).light}
        stroke={ink}
        stroke-width={1.6}
      />
      <path
        d={`M${-9 * s} ${0.5 * s}L${-2.5 * s} ${7 * s}L${10 * s} ${-7 * s}`}
        {...line}
        stroke-width={3}
      />
    </g>
  );
}

/** Action pips: `left` filled; the last `planned` of those drawn hollow (what the plan would spend). */
export function Pips({
  total,
  left,
  planned = 0,
  size = 12,
}: {
  total: number;
  left: number;
  planned?: number;
  size?: number;
}): JSX.Element {
  const gap = size * 1.7;
  const r = size / 2;
  const width = total > 0 ? (total - 1) * gap + size + 4 : size;
  const ramp = accentRamp(PALETTE, MAP_TUNING.accent);
  return (
    <svg viewBox={`0 0 ${width} ${size + 4}`} width={width} height={size + 4} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < left;
        const spending = filled && i >= left - planned;
        return (
          <circle
            key={i}
            cx={2 + r + i * gap}
            cy={2 + r}
            r={r}
            fill={filled && !spending ? ramp.base : PALETTE.paper}
            stroke={filled ? ink : PALETTE.inkSoft}
            stroke-width={1.4}
            stroke-dasharray={spending ? '2.5 2' : filled ? undefined : '1.5 2.5'}
          />
        );
      })}
    </svg>
  );
}
