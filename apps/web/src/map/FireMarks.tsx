/**
 * The small marks the fire rework adds to cards: a threat that fears fire, a feature a fire would burn, a lit
 * brazier's nights left. Each is drawn by the art kit and has its tip; none of them carries a word.
 */
import {
  drawBurnableMark,
  drawFearsFireMark,
  drawNightsLeft,
  type SvgNode,
} from '@behemoth-road/art';
import type { JSX } from 'preact';
import { tipProps } from '../ui/press.ts';
import { PALETTE } from './art.ts';
import { toPreact } from './svgToPreact.ts';

const placed = (node: SvgNode, x: number, y: number): JSX.Element =>
  toPreact({ ...node, attrs: { ...node.attrs, x, y } });

export const FIRE_MARK = 20;
const NIGHTS_H = 16;
/** Width of the nights-left mark. */
export const NIGHTS_W = NIGHTS_H * 3;

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
