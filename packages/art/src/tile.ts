/**
 * The ground: each tile's top face and, where nothing stands in front of it, its thin side face, plus washes,
 * marks, rivers and the fog treatments. Shapes with the same paint are merged into one path per layer, so a
 * 91-hex map stays a few dozen nodes (the web app hit-tests hexes by maths, not by element).
 */
import { ART_TUNING } from './config.ts';
import { refUrl } from './filters.ts';
import { ellipsePath, poly, smoothClosed, smoothOpen, type Box, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import {
  DIRECTIONS,
  hexCenter,
  hexCorners,
  hexKey,
  onPlane,
  type Projection,
} from './projection.ts';
import { inkAttrs } from './props.ts';
import { rngFor, type Rng } from './rng.ts';
import { el, type AttrValue, type SvgNode } from './svg.ts';
import type { FeatureArt } from './features.ts';
import type { SettlementArt } from './settlements.ts';
import type { ThreatArt } from './threats.ts';
import { terrainLook, TRODDEN_LOOK } from './terrain.ts';

/**
 * `seen`: explored ground. `unexplored`: in the window, terrain known, under the veil until someone explores
 * it. `unseen`: blank paper. `fading`: behind the creature, about to be lost. `lost`: gone into the fog.
 */
export type CellState = 'seen' | 'unexplored' | 'unseen' | 'fading' | 'lost';

export interface ArtCell {
  readonly q: number;
  readonly r: number;
  /** A terrain id (`TERRAIN_LOOKS`); unknown ids draw the neutral look. */
  readonly terrain: string;
  /** Default `seen`. */
  readonly state?: CellState;
  /** A site drawn on the tile (`SITE_PROPS`), such as `ruin`. */
  readonly site?: string;
  /** Shows the glint (the hint mark): something here is undiscovered, never what. */
  readonly hint?: boolean;
  /** A revealed feature on the tile (a resource node, a site, a trap); it replaces the terrain's props. */
  readonly feature?: FeatureArt;
  /** A fire burns here (lit today); visible to everyone, also under the veil. */
  readonly fire?: boolean;
  /** A burnable feature stood here and a fire burnt it away (a `BURNT_LOOKS` id): ash and stumps. */
  readonly burnt?: string;
  /** A threat on the hex (public): drawn in full, also under the veil; it replaces the terrain's props. */
  readonly threat?: ThreatArt;
  /** A people's settlement on the hex (public): drawn in full, also under the veil; it replaces the props. */
  readonly settlement?: SettlementArt;
  /** Hand-placed props replacing the terrain's own: kind and offset from the centre in hex sizes. */
  readonly props?: readonly PropSpot[];
}

/** A hand-placed prop: kind, offset from the tile centre in hex sizes, and an optional size factor. */
export interface PropSpot {
  readonly kind: string;
  readonly dx: number;
  readonly dy: number;
  readonly scale?: number;
}

/** A hex's top face and, below its front edges, its side faces: the area a veil covers. */
function veilOutline(p: Projection, corners: readonly Point[]): Point[] {
  return p.depth > 0
    ? [
        ...corners.slice(0, 4).map((q) => ({ x: q.x, y: q.y + p.depth })),
        ...corners.slice(3),
        corners[0]!,
      ]
    : [...corners];
}

/**
 * A hex's veil shape: its top face and a side strip only under the edges that show a side face (no solid tile
 * in front). A strip over an edge with a tile in front would paint the top of that tile, so a tile further
 * back would show its forward edge on top of the one before it.
 */
function veilShape(p: Projection, corners: readonly Point[], sides: readonly boolean[]): string {
  let d = poly(corners);
  if (p.depth > 0) {
    for (let i = 0; i < 3; i += 1) {
      if (!sides[i]) continue;
      const a = corners[i]!;
      const b = corners[i + 1]!;
      d += poly([a, b, { x: b.x, y: b.y + p.depth }, { x: a.x, y: a.y + p.depth }]);
    }
  }
  return d;
}

/**
 * One hex's veil, on its own, for the map to lift away when the hex becomes explored (fade it and drift it
 * up a little). Drawn with the scene's veil pattern (same `prefix`).
 */
export function drawVeilLift(p: Projection, hex: { q: number; r: number }, prefix = 'br'): SvgNode {
  const corners = hexCorners(p, hexCenter(p, hex.q, hex.r));
  return el('path', {
    d: poly(veilOutline(p, corners)),
    fill: refUrl(prefix, 'veil'),
    'data-veil': `${hex.q},${hex.r}`,
  });
}

export function cellState(cell: ArtCell): CellState {
  return cell.state ?? 'seen';
}

export function isSolid(cell: ArtCell | undefined): boolean {
  if (!cell) return false;
  const s = cellState(cell);
  return s === 'seen' || s === 'fading' || s === 'unexplored';
}

/** Collects path data by paint, so each paint becomes one element. Insertion order is kept. */
class Batch {
  private readonly items = new Map<string, { attrs: Record<string, AttrValue>; d: string[] }>();

  add(attrs: Record<string, AttrValue>, d: string): void {
    if (!d) return;
    const key = JSON.stringify(attrs);
    const item = this.items.get(key);
    if (item) item.d.push(d);
    else this.items.set(key, { attrs, d: [d] });
  }

  nodes(): SvgNode[] {
    return [...this.items.values()].map(({ attrs, d }) => el('path', { d: d.join(''), ...attrs }));
  }
}

function blob(rng: Rng, p: Projection, c: Point, r: number, n: number, wobble: number): Point[] {
  const out: Point[] = [];
  const turn = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i += 1) {
    const a = turn + (Math.PI * 2 * i) / n;
    const f = r * (1 + rng.range(-wobble, wobble));
    out.push(onPlane(p, c, Math.cos(a) * f, Math.sin(a) * f));
  }
  return out;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export interface GroundLayers {
  /** Washes, sides, marks, rivers and ink edges of seen and fading tiles; drawn under the wash filter. */
  readonly ground: SvgNode[];
  /** Crisp marks drawn without the filter: the dotted outlines of unseen tiles. */
  readonly crisp: SvgNode[];
  /** The ground's extent. */
  readonly boxes: Box[];
}

export function drawGround(
  cells: readonly ArtCell[],
  p: Projection,
  palette: Palette,
  seed: string | number,
  ink: number,
  /** Hexes the creature stands on (`hexKey`): drawn as its own trodden ground instead of their terrain. */
  occupied: ReadonlySet<string> = new Set(),
  /** Prefix of the scene's defs (for the veil pattern). */
  prefix = 'br',
): GroundLayers {
  const byKey = new Map(cells.map((c) => [hexKey(c.q, c.r), c]));
  const k = p.k;
  const sides = new Batch();
  const tops = new Batch();
  const washes = new Batch();
  const marks = new Batch();
  const treads = new Batch();
  const scuffs = new Batch();
  const rivers = { banks: [] as string[], water: [] as string[], light: [] as string[] };
  const veils = new Batch();
  const fog = new Batch();
  const outlines: string[] = [];
  const dotted: string[] = [];
  const veiled: string[] = [];
  const boxes: Box[] = [];

  const ordered = [...cells].sort((a, b) => {
    const ca = hexCenter(p, a.q, a.r);
    const cb = hexCenter(p, b.q, b.r);
    return ca.y - cb.y || ca.x - cb.x;
  });

  for (const cell of ordered) {
    const state = cellState(cell);
    const c = hexCenter(p, cell.q, cell.r);
    const corners = hexCorners(p, c);
    boxes.push({
      x0: c.x - p.size,
      y0: c.y - p.size * p.squash,
      x1: c.x + p.size,
      y1: c.y + p.size * p.squash + p.depth,
    });
    const rng = rngFor(seed, 'ground', cell.q, cell.r);

    if (state === 'unseen') {
      dotted.push(poly(hexCorners(p, c, 0.94)));
      continue;
    }
    if (state === 'lost') {
      fog.add({ fill: palette.fog, opacity: 0.9 }, smoothClosed(blob(rng, p, c, 0.72, 9, 0.12)));
      const curl = (dx: number, dy: number, s: number): string =>
        smoothOpen([
          onPlane(p, c, dx - 0.22 * s, dy),
          onPlane(p, c, dx, dy - 0.12 * s),
          onPlane(p, c, dx + 0.16 * s, dy - 0.02 * s),
          onPlane(p, c, dx + 0.08 * s, dy + 0.1 * s),
          onPlane(p, c, dx - 0.02 * s, dy + 0.02 * s),
        ]);
      fog.add(
        { ...inkAttrs(palette.inkSoft, ink * 0.8), opacity: 0.55 },
        curl(rng.range(-0.3, -0.1), rng.range(-0.2, 0.1), 1) +
          curl(rng.range(0.15, 0.35), rng.range(0.05, 0.3), 0.8),
      );
      dotted.push(poly(hexCorners(p, c, 0.94)));
      continue;
    }

    const trodden = occupied.has(hexKey(cell.q, cell.r));
    // Trodden ground keeps its terrain (a cliff stays a cliff, a river a river) under a sandy wash.
    const look = terrainLook(cell.terrain);
    const ground = palette.ramps[look.ground];
    const side = palette.ramps[look.side];

    // Side faces on the edges that face the viewer and have no solid tile in front.
    const showsSide = [false, false, false];
    if (p.depth > 0) {
      for (let i = 0; i < 3; i += 1) {
        const d = DIRECTIONS[i]!;
        if (isSolid(byKey.get(hexKey(cell.q + d.q, cell.r + d.r)))) continue;
        showsSide[i] = true;
        const a = corners[i]!;
        const b = corners[i + 1]!;
        const a2 = { x: a.x, y: a.y + p.depth };
        const b2 = { x: b.x, y: b.y + p.depth };
        sides.add({ fill: i === 0 ? side.shade : side.base }, poly([a, b, b2, a2]));
        outlines.push(poly([a, a2, b2, b], false));
      }
    }

    tops.add(
      { fill: ground.base, stroke: ground.shade, 'stroke-width': 1.2 * k, 'stroke-opacity': 0.55 },
      poly(corners),
    );
    const wc = onPlane(p, c, rng.range(-0.2, 0.2), rng.range(-0.2, 0.2));
    washes.add(
      { fill: ground.light, opacity: 0.75 },
      smoothClosed(blob(rng, p, wc, rng.range(0.42, 0.58), 8, 0.18)),
    );
    if (rng.chance(0.6)) {
      const sc = onPlane(p, c, rng.range(-0.35, 0.35), rng.range(-0.3, 0.3));
      washes.add(
        { fill: ground.shade, opacity: 0.22 },
        smoothClosed(blob(rng, p, sc, rng.range(0.15, 0.26), 7, 0.2)),
      );
    }
    if (trodden) {
      treads.add({ fill: palette.ramps[TRODDEN_LOOK.ground].base, opacity: 0.5 }, poly(corners));
    }
    outlines.push(poly(corners));

    // Ground marks painted flat on the tile.
    if (trodden) {
      const lines: string[] = [];
      for (let j = 0, n = rng.int(2, 3); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.5, 0.45), rng.range(-0.45, 0.45));
        const len = rng.range(0.12, 0.22) * p.size;
        lines.push(
          smoothOpen([
            o,
            { x: o.x + len * 0.5, y: o.y - len * 0.1 },
            { x: o.x + len, y: o.y + len * 0.04 },
          ]),
        );
      }
      scuffs.add(inkAttrs(palette.ramps.trodden.shade, ink * 0.85), lines.join(''));
    }
    if (look.marks === 'ripples') {
      const lines: string[] = [];
      for (let j = 0, n = rng.int(2, 3); j < n; j += 1) {
        const y0 = rng.range(-0.45, 0.45);
        const x0 = rng.range(-0.5, -0.1);
        const len = rng.range(0.3, 0.5);
        lines.push(
          smoothOpen(
            [0, 1, 2, 3].map((t) =>
              onPlane(p, c, x0 + (len * t) / 3, y0 + (t % 2 === 0 ? 0 : -0.05)),
            ),
          ),
        );
      }
      marks.add(inkAttrs(palette.ramps.dune.shade, ink * 0.8), lines.join(''));
    } else if (look.marks === 'waves') {
      const lines: string[] = [];
      for (let j = 0, n = rng.int(3, 4); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.5, 0.35), rng.range(-0.5, 0.5));
        const s = 5 * k;
        lines.push(
          smoothOpen([
            o,
            { x: o.x + s, y: o.y - s * 0.5 },
            { x: o.x + 2 * s, y: o.y },
            { x: o.x + 3 * s, y: o.y - s * 0.5 },
          ]),
        );
      }
      marks.add(inkAttrs(palette.ramps.water.shade, ink * 0.8), lines.join(''));
    } else if (look.marks === 'swell') {
      // The sea: more, longer, two-humped swells than a lake's waves, in the sea's own shade.
      const lines: string[] = [];
      for (let j = 0, n = rng.int(4, 5); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.55, 0.2), rng.range(-0.5, 0.5));
        const s = 5.5 * k;
        lines.push(
          smoothOpen(
            [0, 1, 2, 3, 4, 5].map((t) => ({
              x: o.x + s * t,
              y: o.y - (t % 2 === 0 ? 0 : s * 0.55),
            })),
          ),
        );
      }
      marks.add(inkAttrs(palette.ramps.sea.shade, ink * 0.9), lines.join(''));
    } else if (look.marks === 'shoals') {
      // Shallows: a few short ripples and pale sand flecks showing through the clear water.
      const lines: string[] = [];
      const sand: string[] = [];
      for (let j = 0, n = rng.int(2, 3); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.5, 0.3), rng.range(-0.5, 0.5));
        const s = 3.5 * k;
        lines.push(smoothOpen([o, { x: o.x + s, y: o.y - s * 0.45 }, { x: o.x + 2 * s, y: o.y }]));
      }
      for (let j = 0, n = rng.int(3, 5); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.55, 0.55), rng.range(-0.5, 0.5));
        const r = rng.range(0.8, 1.5) * k;
        sand.push(ellipsePath(o.x, o.y, r * 1.3, r * p.squash));
      }
      marks.add({ fill: palette.ramps.dune.light, opacity: 0.7 }, sand.join(''));
      marks.add(inkAttrs(palette.ramps.shoal.shade, ink * 0.8), lines.join(''));
    } else if (look.marks === 'pools') {
      // Standing water: a few small shallow pools with a short ripple stroke across each.
      const pools: string[] = [];
      const glints: string[] = [];
      for (let j = 0, n = rng.int(3, 4); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.5, 0.5), rng.range(-0.45, 0.45));
        const rx = rng.range(2.6, 4.6) * k;
        pools.push(ellipsePath(o.x, o.y, rx, rx * p.squash));
        glints.push(
          smoothOpen([
            { x: o.x - rx * 0.5, y: o.y },
            { x: o.x, y: o.y - rx * p.squash * 0.35 },
            { x: o.x + rx * 0.5, y: o.y },
          ]),
        );
      }
      marks.add({ fill: palette.ramps.water.base, opacity: 0.85 }, pools.join(''));
      marks.add(inkAttrs(palette.ramps.water.shade, ink * 0.7), glints.join(''));
    } else if (look.marks === 'scree') {
      const dots: string[] = [];
      for (let j = 0, n = rng.int(4, 7); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.55, 0.55), rng.range(-0.5, 0.5));
        const r = rng.range(1, 2) * k;
        dots.push(ellipsePath(o.x, o.y, r * 1.3, r * p.squash));
      }
      marks.add({ fill: palette.ramps.crag.shade, opacity: 0.6 }, dots.join(''));
    } else if (look.marks === 'shards') {
      // Glass waste: a scatter of dark slivers lying on the pale ground, each with a pale glint.
      const slivers: string[] = [];
      const glints: string[] = [];
      for (let j = 0, n = rng.int(5, 8); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.55, 0.5), rng.range(-0.5, 0.5));
        const len = rng.range(2.4, 4.4) * k;
        const a = rng.range(-0.5, 0.5);
        const tip = { x: o.x + Math.cos(a) * len, y: o.y + Math.sin(a) * len * p.squash };
        slivers.push(
          poly([
            { x: o.x - 0.5 * k, y: o.y },
            { x: o.x + 0.8 * k, y: o.y - 1.1 * k * p.squash },
            tip,
          ]),
        );
        glints.push(
          poly(
            [o, { x: o.x + (tip.x - o.x) * 0.5, y: o.y + (tip.y - o.y) * 0.5 - 0.5 * k }],
            false,
          ),
        );
      }
      marks.add({ fill: palette.ramps.crag.shade, opacity: 0.85 }, slivers.join(''));
      marks.add(inkAttrs(palette.paper, ink * 0.6), glints.join(''));
    } else if (look.marks === 'murk') {
      // A poisoned lake: slow violet swirls and a few bubbles rising.
      const swirls: string[] = [];
      const bubbles: string[] = [];
      for (let j = 0, n = rng.int(2, 3); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.5, 0.3), rng.range(-0.45, 0.45));
        const s = 4.4 * k;
        swirls.push(
          smoothOpen([
            o,
            { x: o.x + s, y: o.y - s * 0.4 },
            { x: o.x + 2 * s, y: o.y + s * 0.1 },
            { x: o.x + 2.6 * s, y: o.y - s * 0.3 },
          ]),
        );
      }
      for (let j = 0, n = rng.int(4, 6); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.55, 0.55), rng.range(-0.5, 0.5));
        const r = rng.range(0.9, 2.1) * k;
        bubbles.push(ellipsePath(o.x, o.y, r, r * p.squash));
      }
      const tints: string[] = [];
      for (let j = 0, n = rng.int(2, 3); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.35, 0.35), rng.range(-0.3, 0.3));
        const r = rng.range(5, 9) * k;
        tints.push(ellipsePath(o.x, o.y, r * 1.4, r * p.squash));
      }
      marks.add({ fill: palette.accents.plum.base, opacity: 0.42 }, tints.join(''));
      marks.add(inkAttrs(palette.accents.plum.shade, ink * 0.8), swirls.join(''));
      marks.add({ fill: palette.accents.plum.light, opacity: 0.85 }, bubbles.join(''));
      marks.add(inkAttrs(palette.accents.plum.shade, ink * 0.5), bubbles.join(''));
    } else if (look.marks === 'scuffs') {
      // Pressed, scuffed earth: short curved strokes and a few shallow dents.
      const lines: string[] = [];
      for (let j = 0, n = rng.int(3, 5); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.5, 0.45), rng.range(-0.45, 0.45));
        const len = rng.range(0.12, 0.22) * p.size;
        const tilt = rng.range(-0.4, 0.4);
        lines.push(
          smoothOpen([
            o,
            { x: o.x + len * 0.5, y: o.y - len * 0.12 + tilt * len * 0.2 },
            { x: o.x + len, y: o.y + tilt * len * 0.3 },
          ]),
        );
      }
      marks.add(inkAttrs(palette.ramps.trodden.shade, ink * 0.85), lines.join(''));
    } else if (look.marks === 'flecks') {
      const ticks: string[] = [];
      for (let j = 0, n = rng.int(3, 6); j < n; j += 1) {
        const o = onPlane(p, c, rng.range(-0.55, 0.55), rng.range(-0.5, 0.5));
        ticks.push(poly([o, { x: o.x + rng.range(-1, 1) * k, y: o.y - 2.4 * k }], false));
      }
      marks.add({ ...inkAttrs(ground.shade, ink * 0.8) }, ticks.join(''));
    }

    // River ribbon through edge midpoints, joined to neighbouring river tiles.
    if (look.river) {
      const links: number[] = [];
      DIRECTIONS.forEach((d, i) => {
        const n = byKey.get(hexKey(cell.q + d.q, cell.r + d.r));
        if (n && terrainLook(n.terrain).river) links.push(i);
      });
      if (links.length === 0) links.push(3, 0);
      else if (links.length === 1) links.push((links[0]! + 3) % 6);
      const ends = links.map((i) => mid(corners[i]!, corners[(i + 1) % 6]!));
      const centre = onPlane(p, c, rng.range(-0.08, 0.08), rng.range(-0.08, 0.08));
      const f = (q: Point): string => `${Math.round(q.x * 10) / 10} ${Math.round(q.y * 10) / 10}`;
      let d = `M${f(ends[0]!)}Q${f(centre)} ${f(ends[1]!)}`;
      for (const e of ends.slice(2)) d += `M${f(e)}Q${f(mid(e, centre))} ${f(centre)}`;
      rivers.banks.push(d);
      rivers.water.push(d);
      rivers.light.push(d);
    }

    if (state === 'unexplored') {
      veiled.push(veilShape(p, corners, showsSide));
    }
    if (state === 'fading') {
      const veil = { fill: palette.paper, opacity: ART_TUNING.fadingVeil };
      veils.add(veil, veilShape(p, corners, showsSide));
    }
  }

  const riverWidth = p.size * 0.24;
  const riverNodes: SvgNode[] = rivers.water.length
    ? [
        el('path', {
          d: rivers.banks.join(''),
          ...inkAttrs(palette.inkSoft, riverWidth + ink * 2.2),
          'stroke-linecap': 'butt',
        }),
        el('path', {
          d: rivers.water.join(''),
          ...inkAttrs(palette.ramps.water.base, riverWidth),
          'stroke-linecap': 'butt',
        }),
        el('path', {
          d: rivers.light.join(''),
          ...inkAttrs(palette.ramps.water.light, riverWidth * 0.22),
          'stroke-linecap': 'butt',
          opacity: 0.8,
        }),
      ]
    : [];

  const ground: SvgNode[] = [
    ...sides.nodes(),
    ...tops.nodes(),
    ...washes.nodes(),
    ...treads.nodes(),
    ...marks.nodes(),
    ...scuffs.nodes(),
    ...riverNodes,
    ...fog.nodes(),
  ];
  if (outlines.length) {
    ground.push(
      el('g', { opacity: ART_TUNING.outlineOpacity }, [
        el('path', { d: outlines.join(''), ...inkAttrs(palette.ink, ink * 0.85) }),
      ]),
    );
  }
  ground.push(...veils.nodes());
  if (veiled.length) {
    ground.push(
      el('path', { d: veiled.join(''), fill: refUrl(prefix, 'veil'), 'data-veil': 'all' }),
    );
  }
  const crisp: SvgNode[] = dotted.length
    ? [
        el('path', {
          d: dotted.join(''),
          ...inkAttrs(palette.inkSoft, ink * 1.25),
          'stroke-dasharray': `0.1 ${f2(Math.max(4.6 * k, ink * 3.4))}`,
          opacity: 0.9,
        }),
      ]
    : [];
  return { ground, crisp, boxes };
}

function f2(n: number): string {
  return String(Math.round(n * 10) / 10);
}
