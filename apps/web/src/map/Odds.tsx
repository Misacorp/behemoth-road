/**
 * The one "odds" component: the art kit's odds mark (a bar of success against failure, with a badge for
 * what failure means) for any action with a roll, drawn inside an SVG card. Fed only by `OddsView`
 * (`game/odds.ts`, from the core's `oddsOf`). Its tip carries the numbers ("Success 80% · Buried 20%").
 */
import { drawOddsMark } from '@behemoth-road/art';
import type { JSX } from 'preact';
import type { OddsView } from '../game/odds.ts';
import { tipProps } from '../ui/press.ts';
import { PALETTE } from './art.ts';
import { toPreact } from './svgToPreact.ts';

/** The mark is 3.6 times as wide as tall. */
export const ODDS_RATIO = 3.6;
/** Height of the strip an action button grows by to hold its odds. */
export const ODDS_H = 15;
/** The mark's own height on a button (its width, 3.6 times this, fits the button's 48 px). */
export const ODDS_MARK_H = 12;

/** The odds mark at (x, y), `height` px tall. */
export function Odds({
  odds,
  x,
  y,
  height = ODDS_H,
}: {
  odds: OddsView;
  x: number;
  y: number;
  height?: number;
}): JSX.Element {
  const drawn = drawOddsMark(PALETTE, odds.success, odds.art, { size: height });
  return (
    <g
      data-mark="odds"
      data-success={odds.percent.success}
      data-failure-kind={odds.kind}
      data-tip-note={odds.note}
      {...tipProps('map:odds')}
    >
      {toPreact({ ...drawn, attrs: { ...drawn.attrs, x, y } })}
    </g>
  );
}
