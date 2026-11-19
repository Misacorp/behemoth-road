/**
 * One moment, drawn in world px on its own SVG layer over the map and animated by CSS (`styles.css`,
 * `.moment-*`), so it costs no per-frame work. The art kit draws the marks (`drawMoment`): the ink bloom of
 * a reveal, the burst of a find with the found material's icon rising from the site, and the snap of a trap.
 */
import { drawIcon, drawMoment, hexCenter, type SvgNode } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { iconOf } from '../game/chain.ts';
import type { Moment } from '../game/moments.ts';
import { PALETTE, PROJECTION } from './art.ts';
import { toPreact } from './svgToPreact.ts';

const p = PROJECTION;

/** An art kit `<svg>` placed with its centre at (x, y), `size` px across. */
function at(node: SvgNode, x: number, y: number, size: number): JSX.Element {
  return toPreact({
    ...node,
    attrs: { ...node.attrs, x: x - size / 2, y: y - size / 2, width: size, height: size },
  });
}

const CLASS = { reveal: 'moment-bloom', find: 'moment-burst', trap: 'moment-snap' } as const;

export function MomentMark({ moment }: { moment: Moment }): JSX.Element {
  const c = hexCenter(p, moment.hex.q, moment.hex.r);
  const size = 2 * p.size;
  const mark = at(drawMoment(moment.kind, PALETTE, size), c.x, c.y, size);
  return (
    <g data-moment={moment.kind}>
      <g class={`moment ${CLASS[moment.kind]}`}>{mark}</g>
      {moment.kind === 'find' && (
        <g class="moment moment-rise">
          {at(
            drawIcon(iconOf(moment.item), PALETTE, 0.7 * p.size),
            c.x,
            c.y - 0.4 * p.size,
            0.7 * p.size,
          )}
        </g>
      )}
    </g>
  );
}
