/**
 * The fire and rockslide rework's review sheets: the brazier cold and lit (in every palette), the fire ring
 * over a patch of ground with fog beside it, the small marks and moments, and pinned and burnt looks.
 */
import { ART_TUNING } from './config.ts';
import { assignLooks, drawCharacter } from './character.ts';
import { featureDrawer } from './features.ts';
import {
  drawBrazier,
  drawBurnableMark,
  drawBurnt,
  drawFearsFireMark,
  drawFireGlow,
  drawFireRing,
  liePinned,
  drawNightsLeft,
  drawPinned,
  FIRE_MOMENT_KINDS,
} from './fire-art.ts';
import { hexCorners } from './projection.ts';
import { drawIcon } from './icons.ts';
import { drawMoment } from './marks.ts';
import { SPRING, type Palette } from './palette.ts';
import { hexCenter, isometric } from './projection.ts';
import { inkWidth, riseFor, type PropContext } from './props.ts';
import { rngFor } from './rng.ts';
import type { ReviewDraft } from './review.ts';
import { renderSceneFramed } from './scene.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ArtCell } from './tile.ts';
import { poly } from './geom.ts';

const PALETTE: Palette = SPRING;

function sheet(width: number, height: number, children: SvgNode[], palette = PALETTE): string {
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: palette.paper }),
      ...children,
    ]),
  );
}

const placed = (node: SvgNode, x: number, y: number): SvgNode =>
  el('svg', { ...node.attrs, x, y }, node.children);

const wrap = (nodes: SvgNode[]): SvgNode => el('g', {}, nodes);

/** The brazier cold, stocked, then lit with three, two, one and no nights left (Spring, the chosen palette). */
function brazierSheet(): string {
  const k = 1.8;
  const nodes: SvgNode[] = [];
  [
    { lit: false },
    { lit: false, stocked: true },
    { lit: true, nightsLeft: 3 },
    { lit: true, nightsLeft: 2 },
    { lit: true, nightsLeft: 1 },
    { lit: true, nightsLeft: 0 },
  ].forEach((o, i) => {
    nodes.push(
      wrap(drawBrazier(PALETTE, { ...o, origin: { x: 70 + i * 115, y: 190 }, k, seed: i }).nodes),
    );
  });
  return sheet(720, 240, nodes);
}

/** A patch of ground with a lit brazier, its fire ring (radius 1) and fogged hexes, beside a cold one. */
function ringSheet(): string {
  const p = isometric();
  const cells: ArtCell[] = [];
  const brazier = { q: 1, r: 1 };
  for (let q = -1; q <= 5; q += 1)
    for (let r = -1; r <= 4; r += 1)
      cells.push({ q, r, terrain: (q + r) % 3 ? 'plains' : 'forest' });
  const scene = renderSceneFramed({
    cells,
    projection: p,
    palette: PALETTE,
    seed: 'fire-ring',
    frame: 'none',
    effects: 'lite',
  });
  const vb = scene.viewBox;
  const at = hexCenter(p, brazier.q, brazier.r);
  const cold = hexCenter(p, 4, 2);
  const fog = cells
    .filter((c) => c.q >= 4 && c.r <= 0)
    .map((c) =>
      el('path', {
        d: poly(hexCorners(p, hexCenter(p, c.q, c.r))),
        fill: PALETTE.paper,
        opacity: 0.6,
      }),
    );
  const w = 760;
  const h = (vb.height / vb.width) * w;
  return toSvgString(
    el('svg', { viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`, width: w, height: h }, [
      el('rect', { x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: PALETTE.paper }),
      ...scene.svg.children,
      drawFireGlow(p, brazier, PALETTE),
      drawFireRing(p, brazier, PALETTE),
      wrap(
        drawBrazier(PALETTE, {
          lit: true,
          nightsLeft: 2,
          origin: at,
          k: p.k,
          squash: p.squash,
          seed: 1,
        }).nodes,
      ),
      wrap(
        drawBrazier(PALETTE, {
          lit: false,
          origin: cold,
          k: p.k,
          squash: p.squash,
          seed: 2,
        }).nodes,
      ),
      ...fog,
    ]),
  );
}

/** The small marks on their own: nights left, fears fire, burnable, dig out, light fire and the slide moment. */
function marksSheet(): string {
  const nodes: SvgNode[] = [];
  [0, 1, 2, 3].forEach((n, i) =>
    nodes.push(placed(drawNightsLeft(PALETTE, n, 40), 20 + i * 110, 20)),
  );
  nodes.push(placed(drawFearsFireMark(PALETTE, 64), 480, 12));
  nodes.push(placed(drawBurnableMark(PALETTE, 64), 560, 12));
  nodes.push(placed(drawFearsFireMark(PALETTE, 24), 640, 32));
  nodes.push(placed(drawBurnableMark(PALETTE, 24), 680, 32));
  nodes.push(placed(drawIcon('dig-out', PALETTE, 72), 20, 100));
  nodes.push(placed(drawIcon('light-fire', PALETTE, 72), 110, 100));
  nodes.push(placed(drawIcon('dig-out', PALETTE, 28), 210, 122));
  FIRE_MOMENT_KINDS.forEach((kind, i) =>
    nodes.push(placed(drawMoment(kind, PALETTE, 110), 300 + i * 120, 90)),
  );
  return sheet(720, 210, nodes);
}

/** Pinned characters (on three looks) and the burnt deadfall and snare beside the ones they replace. */
function pinnedBurntSheet(): string {
  const nodes: SvgNode[] = [];
  const looks = assignLooks([3, 8, 21]);
  const ink = ART_TUNING.inkWidth * 1.6;
  const tilt = ART_TUNING.tilt;
  looks.forEach(({ accent, look }, i) => {
    const origin = { x: 210 + i * 0, y: 90 + i * 100 };
    nodes.push(
      wrap([
        ...liePinned(drawCharacter(PALETTE, accent, origin, 150, tilt, ink, look), origin, 150)
          .nodes,
        ...drawPinned(PALETTE, origin, 150, tilt, ink).nodes,
      ]),
    );
  });
  // A free character beside them, for scale.
  const free = looks[0]!;
  nodes.push(
    wrap(drawCharacter(PALETTE, free.accent, { x: 560, y: 110 }, 150, tilt, ink, free.look).nodes),
  );
  const ctx = (x: number, y: number, seed: string): PropContext => ({
    palette: PALETTE,
    rng: rngFor(seed),
    origin: { x, y },
    k: 1.5,
    squash: tilt,
    ink: inkWidth(1.5),
    rise: riseFor(tilt),
  });
  nodes.push(
    wrap(featureDrawer('deadfall')(ctx(80, 430, 'a'), 'ready').nodes),
    wrap(drawBurnt(PALETTE, 'deadfall', { origin: { x: 240, y: 430 }, k: 1.5, seed: 1 }).nodes),
    wrap(featureDrawer('snare')(ctx(400, 430, 'b'), 'ready').nodes),
    wrap(drawBurnt(PALETTE, 'snare', { origin: { x: 540, y: 430 }, k: 1.5, seed: 2 }).nodes),
  );
  return sheet(640, 470, nodes);
}

export function fireReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  const group = 'Fire and rockslide';
  return [
    {
      id: 'fire/brazier',
      group,
      title:
        'The low stone brazier with its tall flame: cold with ash, cold and stocked, then lit with three, two, one and no nights left (notches on its foot)',
      file: 'fire-brazier.svg',
      ...glance,
      svg: brazierSheet(),
    },
    {
      id: 'fire/ring',
      group,
      title:
        'A lit brazier glowing orange on its own hex and the hexes within one step, with the fire ring round them, a cold brazier (no glow) beside it and fogged hexes at the edge',
      file: 'fire-ring.svg',
      ...glance,
      svg: ringSheet(),
    },
    {
      id: 'fire/marks',
      group,
      title:
        'Nights left (none to three embers), fears fire (a beast rearing from a flame), burnable (a log with a flame), dig out and light fire icons, and the rockslide moment',
      file: 'fire-marks.svg',
      ...glance,
      svg: marksSheet(),
    },
    {
      id: 'fire/pinned-burnt',
      group,
      title:
        'Pinned: lying almost flat under stones, head and an arm out (three looks, a free character beside them); a deadfall and a snare, then burnt',
      file: 'fire-pinned-burnt.svg',
      ...glance,
      svg: pinnedBurntSheet(),
    },
  ];
}
