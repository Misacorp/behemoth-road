/**
 * Review sheets for the thirteenth round's new art (Spring only: the chosen palette): the blocked-hex
 * pattern, the hazard terrains, the capybara and its marks, the hand cart, and the odds and struggle marks.
 * The art itself is drawn in every palette in the code (and tested so); only the sheets show Spring.
 */
import { drawBlockedHexes } from './blocked.ts';
import { drawCart, drawCargoFill, CART_STATES } from './cart-art.ts';
import { drawHazardIcon, drawScreeField } from './hazards.ts';
import { drawIcon } from './icons.ts';
import { drawCapybara, drawLeadsLeft } from './lure-art.ts';
import { drawOddsMark } from './odds.ts';
import { SPRING, type Palette } from './palette.ts';
import { hexCenter, isometric, type Hex, type Projection } from './projection.ts';
import { renderSceneFramed } from './scene.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ReviewDraft } from './review.ts';
import type { ArtCell } from './tile.ts';

const PALETTE: Palette = SPRING;
const WIDTH = 720;

const placed = (node: SvgNode, x: number, y: number): SvgNode =>
  el('svg', { ...node.attrs, x, y }, node.children);

interface SheetInput {
  readonly cells: readonly ArtCell[];
  readonly seed: string;
  /** Overlays in the scene's drawing coordinates, over the terrain. */
  readonly over: (p: Projection) => SvgNode[];
  /** Icons and marks in a strip below, in sheet px. */
  readonly strip?: readonly SvgNode[];
  readonly stripHeight?: number;
}

/** A scene with overlays, and an optional strip of icons under it, as one SVG. */
function sceneSheet(input: SheetInput): string {
  const p = isometric();
  const scene = renderSceneFramed({
    cells: [...input.cells],
    projection: p,
    palette: PALETTE,
    seed: input.seed,
    frame: 'none',
    effects: 'lite',
  });
  const vb = scene.viewBox;
  const h = Math.round((vb.height / vb.width) * WIDTH);
  const stripH = input.stripHeight ?? 0;
  return toSvgString(
    el('svg', { viewBox: `0 0 ${WIDTH} ${h + stripH}`, width: WIDTH, height: h + stripH }, [
      el('rect', { x: 0, y: 0, width: WIDTH, height: h + stripH, fill: PALETTE.paper }),
      el(
        'svg',
        {
          x: 0,
          y: 0,
          width: WIDTH,
          height: h,
          viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
        },
        [
          el('rect', { x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: PALETTE.paper }),
          ...scene.svg.children,
          ...input.over(p),
        ],
      ),
      ...(input.strip ?? []).map((n) => el('g', { transform: `translate(0 ${h})` }, [n])),
    ]),
  );
}

const grid = (
  qs: readonly number[],
  rs: readonly number[],
  terrain: (q: number, r: number) => string,
): ArtCell[] => qs.flatMap((q) => rs.map((r) => ({ q, r, terrain: terrain(q, r) })));

/** Striped blocked hexes on every kind of ground; a fire cluster with its flame mark, and a plain one. */
function blockedSheet(): string {
  const terrains = ['plains', 'forest', 'desert', 'lake', 'rocks', 'swamp', 'hills', 'pines'];
  const cells = grid(
    [0, 1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 4],
    (q, r) => terrains[(q * 2 + r * 3) % terrains.length]!,
  );
  const fire: Hex[] = [
    { q: 1, r: 1 },
    { q: 2, r: 0 },
    { q: 2, r: 1 },
    { q: 1, r: 2 },
    { q: 0, r: 2 },
    { q: 0, r: 1 },
    { q: 3, r: 0 },
  ];
  const plain: Hex[] = [
    { q: 5, r: 2 },
    { q: 5, r: 3 },
    { q: 6, r: 2 },
  ];
  return sceneSheet({
    cells,
    seed: 'blocked',
    over: (p) => [
      drawBlockedHexes(p, fire, PALETTE, { reason: 'fire' }),
      drawBlockedHexes(p, plain, PALETTE),
    ],
  });
}

/** Glass waste and poisoned lake tiles among plain and desert ones; their icons and a scree field below. */
function hazardSheet(): string {
  const special = (q: number, r: number): string => {
    if (q >= 0 && q <= 2 && r >= 0 && r <= 1) return 'glass-waste';
    if (q >= 3 && q <= 5 && r >= 0 && r <= 1) return 'poisoned-lake';
    if (q >= 0 && q <= 2 && r >= 3) return 'rocks';
    return (q + r) % 2 ? 'plains' : 'desert';
  };
  const screeHexes: Hex[] = [
    { q: 0, r: 3 },
    { q: 1, r: 3 },
    { q: 1, r: 2 },
    { q: 2, r: 2 },
  ];
  const cells: ArtCell[] = grid([0, 1, 2, 3, 4, 5], [0, 1, 2, 3], special).map((c) =>
    screeHexes.some((h) => h.q === c.q && h.r === c.r)
      ? { ...c, threat: { look: 'rockslide', strength: 2 } }
      : c,
  );
  const icons = ['glass-waste', 'poisoned-lake', 'scree-field'].flatMap((key, i) => [
    placed(drawHazardIcon(key, PALETTE, 84), 80 + i * 120, 16),
    placed(drawHazardIcon(key, PALETTE, 32), 460 + i * 56, 42),
  ]);
  return sceneSheet({
    cells,
    seed: 'hazards',
    over: (p) => [drawScreeField(p, screeHexes, PALETTE)],
    strip: icons,
    stripHeight: 116,
  });
}

/** Capybaras, normal and settled, on three grounds; the lead icon and the leads-left mark below. */
function capybaraSheet(): string {
  const cells = grid([0, 1, 2, 3], [0, 1], (q) => (q % 2 ? 'forest' : 'plains'));
  const at = (p: Projection, q: number, r: number) => ({
    origin: { x: hexCenter(p, q, r).x, y: hexCenter(p, q, r).y + 6 * p.k },
    k: p.k,
    squash: p.squash,
    seed: q + r,
  });
  const strip = [
    placed(drawIcon('lead', PALETTE, 84), 40, 14),
    placed(drawIcon('lead', PALETTE, 32), 140, 40),
    ...[0, 1, 2, 3].map((n, i) => placed(drawLeadsLeft(PALETTE, n, 40), 230 + i * 110, 36)),
  ];
  return sceneSheet({
    cells,
    seed: 'capybara',
    over: (p) => [
      ...[
        [0, 0, 'normal'],
        [1, 0, 'settled'],
        [2, 0, 'normal'],
        [3, 0, 'settled'],
        [0, 1, 'settled'],
        [2, 1, 'normal'],
      ].map(([q, r, s]) =>
        el('g', {}, drawCapybara(PALETTE, s as string, at(p, q as number, r as number)).nodes),
      ),
    ],
    strip,
    stripHeight: 116,
  });
}

/** The four cart states on plains, the four action icons and the cargo fill mark below. */
function cartSheet(): string {
  const cells = grid([0, 1, 2, 3], [0, 1], () => 'plains');
  const strip = [
    ...['hitch', 'board-cart', 'load', 'unload', 'struggle'].map((key, i) =>
      placed(drawIcon(key, PALETTE, 76), 30 + i * 90, 12),
    ),
    ...['hitch', 'board-cart', 'load', 'unload'].map((key, i) =>
      placed(drawIcon(key, PALETTE, 28), 30 + i * 36, 100),
    ),
    ...[0, 0.4, 0.8, 1].map((f, i) =>
      placed(drawCargoFill(PALETTE, f, 5, 30), 480 + (i % 2) * 120, 20 + Math.floor(i / 2) * 44),
    ),
  ];
  return sceneSheet({
    cells,
    seed: 'cart',
    over: (p) =>
      CART_STATES.map((state, i) => {
        const [q, r] = [
          [0, 0],
          [2, 0],
          [0, 1],
          [2, 1],
        ][i]!;
        const h = hexCenter(p, q!, r!);
        return el(
          'g',
          {},
          drawCart(PALETTE, state, {
            origin: { x: h.x - 4 * p.k, y: h.y + 8 * p.k },
            k: p.k,
            squash: p.squash,
          }).nodes,
        );
      }),
    strip,
    stripHeight: 140,
  });
}

/** Odds marks: bars from none to certain for each failure, a row of pips, and the struggle icon. */
function oddsSheet(): string {
  const nodes: SvgNode[] = [];
  const failures = ['rocks', 'anger', 'harm'];
  [0, 0.2, 0.5, 0.75, 1].forEach((s, col) =>
    failures.forEach((f, row) =>
      nodes.push(placed(drawOddsMark(PALETTE, s, f, { size: 34 }), 30 + col * 136, 24 + row * 52)),
    ),
  );
  [0.2, 0.6, 1].forEach((s, i) =>
    nodes.push(
      placed(
        drawOddsMark(PALETTE, s, i % 2 ? 'anger' : 'rocks', { style: 'pips', size: 40 }),
        30 + i * 150,
        210,
      ),
    ),
  );
  nodes.push(
    placed(drawIcon('struggle', PALETTE, 84), 520, 190),
    placed(drawIcon('struggle', PALETTE, 30), 620, 218),
  );
  return toSvgString(
    el('svg', { viewBox: `0 0 ${WIDTH} 290`, width: WIDTH, height: 290 }, [
      el('rect', { x: 0, y: 0, width: WIDTH, height: 290, fill: PALETTE.paper }),
      ...nodes,
    ]),
  );
}

export function round13ReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  const group = 'Round 13: blocked, hazards, lure, cart, odds';
  return [
    {
      id: 'r13/blocked',
      group,
      title:
        'Blocked hexes: diagonal stripes with a thin edge over every ground, a fire cluster with its flame mark and a plain one',
      file: 'r13-blocked.svg',
      ...glance,
      svg: blockedSheet(),
    },
    {
      id: 'r13/hazards',
      group,
      title:
        'Hazard terrains: glass waste, a poisoned lake and a scree field under rockslide threats, with their icons',
      file: 'r13-hazards.svg',
      ...glance,
      svg: hazardSheet(),
    },
    {
      id: 'r13/capybara',
      group,
      title:
        'The capybara, normal and settled, the lead action icon and the leads-left pawprints (3 to 0)',
      file: 'r13-capybara.svg',
      ...glance,
      svg: capybaraSheet(),
    },
    {
      id: 'r13/cart',
      group,
      title:
        'The hand cart: empty, loaded, with a rider and hitched with a puller; hitch, board, load, unload and struggle icons; cargo fill',
      file: 'r13-cart.svg',
      ...glance,
      svg: cartSheet(),
    },
    {
      id: 'r13/odds',
      group,
      title:
        'The odds mark: bars from no chance to certain (failure shown as rocks, anger or harm), a row of pips, and the struggle icon',
      file: 'r13-odds.svg',
      ...glance,
      svg: oddsSheet(),
    },
  ];
}
