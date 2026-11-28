/**
 * One moment, drawn in world px on its own SVG layer over the map and animated by CSS (`styles.css`,
 * `.moment-*`), so it costs no per-frame work. The art kit draws the marks: an explored hex's veil lifting
 * away (`drawVeilLift`), the survey and reveal blooms, the burst of a find with the material's icon rising,
 * the snap of a trap (`drawMoment`), a material dropping into the stores on the creature, a finished
 * unlock's sealed icon rising from the creature, and Milestone 4's fire lit, feeding (the food dropping in),
 * linger and stayed (`drawMoment`), a fire going out (its mark lifting away) and the creature eating from
 * the stores (the material rising off its back).
 */
import {
  ART_TUNING,
  drawCapybara,
  drawCart,
  drawCharacter,
  drawHazardIcon,
  drawIcon,
  drawMoment,
  drawVeilLift,
  el,
  hexCenter,
  renderSceneFramed,
  type SvgNode,
} from '@behemoth-road/art';
import type { CreatureSigns, GameStateView } from '@behemoth-road/core';
import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { accentOf, lookOf } from '../game/identity.ts';
import { characterArts, creatureArt } from './cells.ts';
import { MAP_TUNING } from './config.ts';
import { slideFrom } from './cssTransform.ts';
import { iconOf } from '../game/chain.ts';
import { type Moment, STEP_MS } from '../game/moments.ts';
import { drawM5Moment, drawMisledMark, PALETTE, PROJECTION } from './art.ts';
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

/**
 * The creature (with its riders) walking its daily step: drawn at its new hex, slid there from the old one
 * by a Web Animation (the world layer leaves it out meanwhile).
 */
function StepMark({
  state,
  signs,
  from,
}: {
  state: GameStateView;
  signs: CreatureSigns | null;
  from: { q: number; r: number };
}) {
  const ref = useRef<SVGGElement>(null);
  const to = state.creature.centre;
  useLayoutEffect(() => {
    const a = hexCenter(p, from.q, from.r);
    const b = hexCenter(p, to.q, to.r);
    const g = ref.current;
    if (!g) return;
    const run = slideFrom(g, a.x - b.x, a.y - b.y, STEP_MS);
    return () => run.cancel();
  }, [from.q, from.r, to.q, to.r]);
  const { svg, viewBox } = renderSceneFramed({
    cells: [],
    creature: creatureArt(state, signs),
    characters: characterArts(state, 'riders'),
    projection: p,
    palette: PALETTE,
    seed: state.artSeed,
    minInkPx: MAP_TUNING.minInkPx,
    frame: 'none',
    effects: 'lite',
    idPrefix: 'step',
  });
  return (
    <g ref={ref} data-step={`${from.q},${from.r}`}>
      {toPreact(
        el(
          'svg',
          {
            ...svg.attrs,
            x: viewBox.x,
            y: viewBox.y,
            width: viewBox.width,
            height: viewBox.height,
          },
          svg.children,
        ),
      )}
    </g>
  );
}

/** Your figure fading into the fog where it was left behind. */
function lostFigure(characterId: string, hex: { q: number; r: number }): JSX.Element {
  const c = hexCenter(p, hex.q, hex.r);
  const feet = { x: c.x, y: c.y + 0.1 * p.size };
  const look = lookOf(characterId);
  const drawn = drawCharacter(
    PALETTE,
    accentOf(characterId, MAP_TUNING.accent),
    feet,
    p.size,
    p.squash,
    ART_TUNING.inkWidth * p.k,
    look,
  );
  return (
    <g>
      <g class="moment moment-fade">{drawn.nodes.map(toPreact)}</g>
      <g class="moment moment-fog">
        <ellipse
          cx={feet.x}
          cy={feet.y - 0.3 * p.size}
          rx={0.6 * p.size}
          ry={0.5 * p.size}
          fill={PALETTE.fog}
        />
      </g>
    </g>
  );
}

export function MomentMark({
  moment,
  state,
  signs = null,
}: {
  moment: Moment;
  state: GameStateView;
  /** Your signs, so the walking creature looks as it does on the map. */
  signs?: CreatureSigns | null;
}): JSX.Element {
  if (moment.kind === 'step') {
    return (
      <g data-moment="step">
        <StepMark state={state} signs={signs} from={moment.from} />
      </g>
    );
  }
  if (moment.kind === 'lost') {
    return <g data-moment="lost">{lostFigure(moment.characterId, moment.hex)}</g>;
  }
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
    case 'stayed':
      // The day's step when it lingered: the art kit's stayed mark on the creature.
      body = (
        <Marked kind="bloom">
          {at(drawMoment('stayed', PALETTE, size), c.x, c.y - 0.4 * p.size, size)}
        </Marked>
      );
      break;
    case 'pinned':
      // The stones coming down on the hex.
      body = (
        <Marked kind="snap">{at(drawMoment('rockslide', PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'struggled':
      // The stones heave and settle: the try that did not work.
      body = (
        <Marked kind="heave">{at(drawMoment('rockslide', PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'dug-out':
      // The same stones lifting away and fading.
      body = (
        <Marked kind="lift">{at(drawMoment('rockslide', PALETTE, size), c.x, c.y, size)}</Marked>
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
    // The polish round: a survey that found nothing, a pursuer led away, peril relieved.
    case 'nothing-here':
    case 'relieved':
      body = (
        <Marked kind="bloom">{at(drawM5Moment(moment.kind, PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'hungry':
      // Peril rose from hunger: the feeding icon rises off the creature (what would have answered it).
      body = (
        <Marked kind="rise">
          {at(drawIcon('feed', PALETTE, icon), c.x, c.y - 0.6 * p.size, icon)}
        </Marked>
      );
      break;
    case 'misled':
      body = (
        <g>
          <Marked kind="burst">{at(drawM5Moment('misled', PALETTE, size), c.x, c.y, size)}</Marked>
          <Marked kind="lift">
            {at(drawMisledMark(PALETTE, icon), c.x, c.y - 0.4 * p.size, icon)}
          </Marked>
        </g>
      );
      break;
    // Hazards and the lure: the harmful ground the creature stepped onto, a lure led, settled, or fled.
    case 'hazard-step':
      body = (
        <g>
          <Marked kind="snap">{at(drawM5Moment('strike', PALETTE, size), c.x, c.y, size)}</Marked>
          <Marked kind="rise">
            {at(drawHazardIcon(moment.terrain, PALETTE, icon), c.x, c.y - 0.5 * p.size, icon)}
          </Marked>
        </g>
      );
      break;
    case 'lure-led':
      body = (
        <Marked kind="rise">
          {at(drawIcon('lead', PALETTE, icon), c.x, c.y - 0.7 * p.size, icon)}
        </Marked>
      );
      break;
    case 'lure-settled':
      body = (
        <Marked kind="bloom">{at(drawMoment('linger', PALETTE, size), c.x, c.y, size)}</Marked>
      );
      break;
    case 'lure-fled':
      body = (
        <Marked kind="lift">
          <g>
            {drawCapybara(PALETTE, 'normal', {
              origin: { x: c.x, y: c.y + 0.12 * p.size },
              k: p.size / 64,
              squash: p.squash,
              seed: 'fled',
            }).nodes.map(toPreact)}
          </g>
        </Marked>
      );
      break;
    // The cart: built, taken up, let go, loaded, unloaded, lost.
    case 'cart-built':
      body = <Marked kind="burst">{at(drawMoment('find', PALETTE, size), c.x, c.y, size)}</Marked>;
      break;
    case 'cart-take':
      body = (
        <Marked kind="rise">
          {at(
            drawIcon(moment.how === 'hitch' ? 'hitch' : 'board-cart', PALETTE, icon),
            c.x,
            c.y - 0.7 * p.size,
            icon,
          )}
        </Marked>
      );
      break;
    case 'cart-leave':
      body = (
        <Marked kind="lift">
          {at(
            drawIcon(moment.how === 'hitch' ? 'hitch' : 'board-cart', PALETTE, icon, {
              done: true,
            }),
            c.x,
            c.y - 0.7 * p.size,
            icon,
          )}
        </Marked>
      );
      break;
    case 'cart-load':
      body = (
        <Marked kind="drop">
          {at(drawIcon(iconOf(moment.item), PALETTE, icon), c.x, c.y - 0.6 * p.size, icon)}
        </Marked>
      );
      break;
    case 'cart-unload':
      body = (
        <Marked kind="rise">
          {at(drawIcon(iconOf(moment.item), PALETTE, icon), c.x, c.y - 0.6 * p.size, icon)}
        </Marked>
      );
      break;
    case 'cart-lost':
      body = (
        <Marked kind="lift">
          <g>
            {drawCart(PALETTE, 'empty', {
              origin: { x: c.x - 0.1 * p.size, y: c.y + 0.1 * p.size },
              k: p.size / 64,
              squash: p.squash,
              seed: 'lost',
            }).nodes.map(toPreact)}
          </g>
        </Marked>
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
