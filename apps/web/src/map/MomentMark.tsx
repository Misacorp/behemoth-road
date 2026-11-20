/**
 * One moment, drawn in world px on its own SVG layer over the map and animated by CSS (`styles.css`,
 * `.moment-*`), so it costs no per-frame work. The art kit draws the marks: an explored hex's veil lifting
 * away (`drawVeilLift`), the survey and reveal blooms, the burst of a find with the material's icon rising,
 * the snap of a trap (`drawMoment`), a material dropping into the stores on the creature, a finished
 * unlock's sealed icon rising from the creature, and Milestone 4's fire lit, feeding (the food dropping in)
 * and linger (`drawMoment` fire, feed, linger), a fire going out (its mark lifting away) and the creature
 * eating from the stores (the material rising off its back).
 */
import { drawIcon, drawMoment, drawVeilLift, hexCenter, type SvgNode } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { iconOf } from '../game/chain.ts';
import type { Moment } from '../game/moments.ts';
import { drawM5Moment, PALETTE, PROJECTION } from './art.ts';
import { toPreact } from './svgToPreact.ts';

const p = PROJECTION;

/** An art kit `<svg>` placed with its centre at (x, y), `size` px across. */
function at(node: SvgNode, x: number, y: number, size: number): JSX.Element {
  return toPreact({
    ...node,
    attrs: { ...node.attrs, x: x - size / 2, y: y - size / 2, width: size, height: size },
  });
}

function Marked({ kind, children }: { kind: string; children: JSX.Element }): JSX.Element {
  return <g class={`moment moment-${kind}`}>{children}</g>;
}

export function MomentMark({ moment }: { moment: Moment }): JSX.Element {
  const c = hexCenter(p, moment.hex.q, moment.hex.r);
  const size = 2 * p.size;
  const icon = 0.7 * p.size;
  let body: JSX.Element;
  switch (moment.kind) {
    case 'explore':
      // The scene's own veil pattern (the map draws with the default id prefix), lifted away.
      body = <Marked kind="lift">{toPreact(drawVeilLift(p, moment.hex))}</Marked>;
      break;
    case 'survey':
    case 'reveal':
      body = (
        <Marked kind="bloom">{at(drawMoment(moment.kind, PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'trap':
      body = <Marked kind="snap">{at(drawMoment('trap', PALETTE, size), c.x, c.y, size)}</Marked>;
      break;
    case 'find':
      body = (
        <g>
          <Marked kind="burst">{at(drawMoment('find', PALETTE, size), c.x, c.y, size)}</Marked>
          <Marked kind="rise">
            {at(drawIcon(iconOf(moment.item), PALETTE, icon), c.x, c.y - 0.4 * p.size, icon)}
          </Marked>
        </g>
      );
      break;
    case 'deposit':
      body = (
        <Marked kind="drop">
          {at(drawIcon(iconOf(moment.item), PALETTE, icon), c.x, c.y - 0.6 * p.size, icon)}
        </Marked>
      );
      break;
    case 'fire-out':
      // The fire's mark drifting up and fading, like its last smoke.
      body = <Marked kind="lift">{at(drawMoment('fire', PALETTE, size), c.x, c.y, size)}</Marked>;
      break;
    case 'ate':
      // A material leaving the stores on the creature's back.
      body = (
        <Marked kind="rise">
          {at(drawIcon(iconOf(moment.item), PALETTE, icon), c.x, c.y - 0.6 * p.size, icon)}
        </Marked>
      );
      break;
    case 'fire':
    case 'linger':
      body = (
        <Marked kind="bloom">{at(drawMoment(moment.kind, PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'feed':
      body = (
        <g>
          <Marked kind="burst">{at(drawMoment('feed', PALETTE, size), c.x, c.y, size)}</Marked>
          {moment.item && (
            <Marked kind="drop">
              {at(drawIcon(iconOf(moment.item), PALETTE, icon), c.x, c.y - 0.6 * p.size, icon)}
            </Marked>
          )}
        </g>
      );
      break;
    // Milestone 5: a threat appearing, strikes, a defence, a settlement turning, a boon, the season's end.
    case 'threat':
    case 'defend':
    case 'befriended':
      body = (
        <Marked kind="bloom">{at(drawM5Moment(moment.kind, PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'strike':
    case 'struck':
    case 'hit':
    case 'angered':
      body = (
        <Marked kind="snap">{at(drawM5Moment(moment.kind, PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'cleared':
    case 'season-over':
      body = (
        <Marked kind="burst">{at(drawM5Moment(moment.kind, PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'boon':
      body = (
        <g>
          <Marked kind="burst">{at(drawM5Moment('boon', PALETTE, size), c.x, c.y, size)}</Marked>
          <Marked kind="rise">
            {at(drawIcon(moment.item, PALETTE, icon), c.x, c.y - 0.4 * p.size, icon)}
          </Marked>
        </g>
      );
      break;
    case 'unlock': {
      const big = 1.2 * p.size;
      body = (
        <g>
          <Marked kind="burst">{at(drawMoment('find', PALETTE, size), c.x, c.y, size)}</Marked>
          <Marked kind="rise">
            {at(
              drawIcon(iconOf(moment.item), PALETTE, big, { done: true }),
              c.x,
              c.y - p.size,
              big,
            )}
          </Marked>
        </g>
      );
      break;
    }
  }
  return <g data-moment={moment.kind}>{body}</g>;
}
