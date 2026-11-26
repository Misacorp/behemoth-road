/**
 * The small marks the fire rework adds to cards: a threat that fears fire, a feature a fire would burn, a lit
 * brazier's nights left, and the falling stones a strike on a slide risks. Each is drawn by the art kit (or,
 * for the stone pips, a few rocks) and has its tip; none of them carries a word.
 */
import { drawBurnableMark, drawFearsFireMark, drawNightsLeft, type SvgNode } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { tipProps } from '../ui/press.ts';
import { PALETTE } from './art.ts';
import { toPreact } from './svgToPreact.ts';

const placed = (node: SvgNode, x: number, y: number): JSX.Element =>
  toPreact({ ...node, attrs: { ...node.attrs, x, y } });

export const FIRE_MARK = 20;
const NIGHTS_H = 16;
/** Width of the nights-left mark. */
export const NIGHTS_W = NIGHTS_H * 2.25;

/** The `fears-fire` mark (a flame crossed out) at (x, y). */
export function FearsFireMark({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-mark="fears-fire" {...tipProps('map:fears-fire')}>
      {placed(drawFearsFireMark(PALETTE, FIRE_MARK), x, y)}
    </g>
  );
}

/** The `burnable` mark (a flame in dashed outline) at (x, y). */
export function BurnableMark({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g data-mark="burnable" {...tipProps('map:burnable')}>
      {placed(drawBurnableMark(PALETTE, FIRE_MARK), x, y)}
    </g>
  );
}

/** A lit brazier's nights left, as embers, at (x, y). */
export function NightsMark({
  nights,
  x,
  y,
}: {
  nights: number;
  x: number;
  y: number;
}): JSX.Element {
  return (
    <g data-mark="nights" data-nights={nights} {...tipProps('map:nights')}>
      {placed(drawNightsLeft(PALETTE, nights, NIGHTS_H), x, y)}
    </g>
  );
}

/** Pips in the fall-risk row. */
export const FALL_PIPS = 4;

/**
 * How many of `total` stone pips a chance fills: scaled to it, at least one while there is any chance and
 * never more than `total`. Pure, so it is tested.
 */
export function fallPips(chance: number, total = FALL_PIPS): number {
  if (!Number.isFinite(chance) || chance <= 0) return 0;
  return Math.max(1, Math.min(total, Math.round(chance * total)));
}

/** Height of the fall-risk row. */
export const FALL_ROW_H = 14;

/**
 * The risk of falling stones for a strike: a row of small rocks, as many dark as the chance is large (the
 * rest faint outlines), at (x, y).
 */
export function FallRisk({ chance, x, y }: { chance: number; x: number; y: number }): JSX.Element {
  const filled = fallPips(chance);
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-mark="fall-risk"
      data-filled={filled}
      {...tipProps('map:fall-risk')}
    >
      {Array.from({ length: FALL_PIPS }, (_, i) => (
        <path
          key={i}
          d={`M${i * 11 + 1} 10l-1-5 4-4 5 2 1 6z`}
          fill={i < filled ? PALETTE.ramps.rock.base : 'none'}
          stroke={i < filled ? PALETTE.ink : PALETTE.inkSoft}
          stroke-width={1}
          stroke-linejoin="round"
          {...(i < filled ? {} : { 'stroke-dasharray': '2 2' })}
          opacity={i < filled ? 1 : 0.5}
        />
      ))}
    </g>
  );
}
