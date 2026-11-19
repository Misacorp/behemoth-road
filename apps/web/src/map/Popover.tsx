/**
 * Popover contents, drawn in SVG in screen px (the map places and clamps them). Visual only: a terrain
 * miniature and a visibility mark for a hex, or the cost pips and a confirm button for a planned move.
 */
import { el, isometric, renderScene, type CellState } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { Pips, TickMark } from '../hud/icons.tsx';
import { PALETTE } from './art.ts';
import { MAP_TUNING } from './config.ts';
import { toPreact } from './svgToPreact.ts';

export const INSPECT_SIZE = { width: 132, height: 76 } as const;
export const CONFIRM_SIZE = { width: 150, height: 60 } as const;

const MINI = isometric(24, MAP_TUNING.tilt);

function Card({ width, height }: { width: number; height: number }): JSX.Element {
  return (
    <g>
      <rect x={2} y={3} width={width - 2} height={height - 2} rx={12} fill={PALETTE.paperDeep} />
      <rect
        width={width - 2}
        height={height - 2}
        rx={12}
        fill={PALETTE.paper}
        stroke={PALETTE.inkSoft}
        stroke-width={1.2}
      />
    </g>
  );
}

/** A one-tile scene from the art kit: the terrain as the map draws it. */
function Miniature({
  terrain,
  state,
  x,
  y,
}: {
  terrain: string;
  state: CellState;
  x: number;
  y: number;
}) {
  const scene = renderScene({
    cells: [{ q: 0, r: 0, terrain, state }],
    projection: MINI,
    palette: PALETTE,
    seed: terrain,
    idPrefix: 'pop',
    // On the card, a page frame would show as a box.
    frame: 'none',
  });
  return toPreact(el('svg', { ...scene.attrs, x, y, width: 64, height: 56 }, scene.children));
}

const eyeLine = {
  fill: 'none',
  stroke: PALETTE.ink,
  'stroke-width': 1.8,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

/** Visibility as a mark: open eye (in play), half-lidded (fading), mist (lost), dotted lid (never seen). */
function VisibilityMark({ state }: { state: CellState }): JSX.Element {
  switch (state) {
    case 'seen':
      return (
        <g>
          <path d="M2 16Q18 2 34 16Q18 30 2 16Z" {...eyeLine} fill={PALETTE.paper} />
          <circle cx={18} cy={16} r={5} fill={PALETTE.ramps.water.shade} stroke={PALETTE.ink} />
        </g>
      );
    case 'fading':
      return (
        <g>
          <path d="M2 16Q18 30 34 16" {...eyeLine} />
          <path d="M2 16Q18 9 34 16" {...eyeLine} />
          <path d="M12 17.5a6 4 0 0 0 12 0Z" fill={PALETTE.ramps.water.shade} />
        </g>
      );
    case 'lost':
      return (
        <g>
          <path
            d="M3 13q5-5 10 0t10 0t10 0M3 21q5-5 10 0t10 0t10 0"
            {...eyeLine}
            stroke={PALETTE.inkSoft}
          />
        </g>
      );
    case 'unseen':
      return (
        <g>
          <path
            d="M2 16Q18 30 34 16"
            {...eyeLine}
            stroke-dasharray="2 3.5"
            stroke={PALETTE.inkSoft}
          />
        </g>
      );
  }
}

export function InspectCard({
  terrain,
  state,
}: {
  terrain: string;
  state: CellState;
}): JSX.Element {
  return (
    <g data-popover="inspect">
      <Card {...INSPECT_SIZE} />
      <Miniature terrain={terrain} state={state} x={6} y={8} />
      <g transform="translate(84 22)">
        <VisibilityMark state={state} />
      </g>
    </g>
  );
}

export function ConfirmCard({
  cost,
  onConfirm,
  buttonRef,
}: {
  cost: number;
  onConfirm: () => void;
  buttonRef: (el: SVGGElement | null) => void;
}): JSX.Element {
  const r = 22;
  const cx = CONFIRM_SIZE.width - r - 8;
  const cy = CONFIRM_SIZE.height / 2 - 1;
  return (
    <g data-popover="confirm">
      <Card {...CONFIRM_SIZE} />
      <g transform={`translate(12 ${cy - 8})`}>
        <Pips total={cost} left={cost} size={14} />
      </g>
      <g
        ref={buttonRef}
        class="svg-button"
        role="button"
        tabIndex={0}
        aria-label="Confirm"
        transform={`translate(${cx} ${cy})`}
        onClick={onConfirm}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        <TickMark r={r} />
      </g>
    </g>
  );
}
