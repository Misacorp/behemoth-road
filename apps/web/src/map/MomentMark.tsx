/**
 * One moment, drawn in world px on its own SVG layer over the map and animated by CSS (`styles.css`,
 * `.moment-*`), so it costs no per-frame work. The ink bloom of a reveal, the found item's icon rising from
 * the site, and the snap mark of a triggered trap.
 */
import { drawIcon, hexCenter } from '@behemoth-road/art';
import type { JSX } from 'preact';
import type { Moment } from '../game/moments.ts';
import { PALETTE, PROJECTION } from './art.ts';
import { toPreact } from './svgToPreact.ts';

const p = PROJECTION;

export function MomentMark({ moment }: { moment: Moment }): JSX.Element {
  const c = hexCenter(p, moment.hex.q, moment.hex.r);
  const s = p.size;
  switch (moment.kind) {
    case 'reveal':
      return (
        <g class="moment moment-bloom" data-moment="reveal">
          <ellipse
            cx={c.x}
            cy={c.y}
            rx={0.8 * s}
            ry={0.8 * s * p.squash}
            fill={PALETTE.hint}
            fill-opacity={0.25}
            stroke={PALETTE.ink}
            stroke-width={2 * p.k}
          />
        </g>
      );
    case 'find': {
      const size = 0.7 * s;
      const icon = drawIcon(moment.item, PALETTE, size);
      return (
        <g class="moment moment-rise" data-moment="find">
          {toPreact({
            ...icon,
            attrs: { ...icon.attrs, x: c.x - size / 2, y: c.y - size, width: size, height: size },
          })}
        </g>
      );
    }
    case 'trap': {
      const w = 0.4 * s;
      const h = 0.18 * s;
      const y = c.y + 0.1 * s;
      const d = `M${c.x - w} ${y}l${w / 3} ${-h}l${w / 3} ${2 * h}l${w / 3} ${-2 * h}l${w / 3} ${2 * h}l${w / 3} ${-2 * h}l${w / 3} ${h}`;
      return (
        <g class="moment moment-snap" data-moment="trap">
          <path
            d={d}
            fill="none"
            stroke={PALETTE.ink}
            stroke-width={3 * p.k}
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      );
    }
  }
}
