/** A map patch as one SVG: paper, the ground under the wash filter, then every upright thing back to front. */
import { drawCharacter, type CharacterArt } from './character.ts';
import { ART_TUNING } from './config.ts';
import { drawCreature, type CreatureArt } from './creature.ts';
import { artDefs, refUrl } from './filters.ts';
import { unionBox, type Box, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { drawOrder, hexCenter, hexDistance, onPlane, type Projection } from './projection.ts';
import {
  hintMark,
  inkWidth,
  PROP_DRAWERS,
  PROP_SPACING,
  type Drawn,
  type PropDraw,
} from './props.ts';
import { rngFor, type Rng } from './rng.ts';
import { el, type SvgNode } from './svg.ts';
import { SITE_PROPS, terrainLook, type PropRule } from './terrain.ts';
import { cellState, drawGround, type ArtCell, type PropSpot } from './tile.ts';

export interface SceneInput {
  readonly cells: readonly ArtCell[];
  readonly creature?: CreatureArt | null;
  readonly characters?: readonly CharacterArt[];
  readonly projection: Projection;
  readonly palette: Palette;
  readonly seed: string | number;
  /** Hand-drawn prop drawers that replace generated ones, by kind. */
  readonly overrides?: Readonly<Record<string, PropDraw>>;
  /** Prefix for filter ids, so several scenes can share one document. Default `br`. */
  readonly idPrefix?: string;
  /**
   * `full` (default) draws the wash bleed, ink wobble and paper grain filters; `lite` leaves them out, for
   * panning or slow phones.
   */
  readonly effects?: 'full' | 'lite';
  /** Screen px per drawing px where the scene is shown (default 1); ink never gets thinner than `minInkPx` on screen. */
  readonly zoom?: number;
  readonly minInkPx?: number;
}

interface Placed {
  readonly at: Point;
  readonly drawn: Drawn;
  readonly opacity?: number;
}

/** Picks spots for a tile's props inside the hex, keeping each prop's spacing. */
function placeProps(rules: readonly PropRule[], rng: Rng): PropSpot[] {
  const out: { kind: string; dx: number; dy: number; space: number }[] = [];
  for (const rule of rules) {
    if (rule.chance !== undefined && !rng.chance(rule.chance)) continue;
    const n = rng.int(rule.count[0], rule.count[1]);
    const space = PROP_SPACING[rule.kind] ?? 0.25;
    for (let i = 0; i < n; i += 1) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const radius =
          n === 1 && rule.count[1] === 1 && space >= 0.5
            ? rng.range(0, 0.08)
            : rng.range(0.05, 0.5);
        const a = rng.range(0, Math.PI * 2);
        const dx = Math.cos(a) * radius;
        const dy = Math.sin(a) * radius * 0.85;
        if (out.every((o) => Math.hypot(o.dx - dx, o.dy - dy) >= (o.space + space) / 2)) {
          out.push({ kind: rule.kind, dx, dy, space });
          break;
        }
      }
    }
  }
  return out;
}

/** The drawing's frame in drawing coordinates (the SVG viewBox), for mapping pointer positions. */
export interface SceneFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FramedScene {
  readonly svg: SvgNode;
  readonly viewBox: SceneFrame;
}

/** The scene as an SVG tree. */
export function renderScene(input: SceneInput): SvgNode {
  return renderSceneFramed(input).svg;
}

/**
 * The scene and its frame as numbers. A pointer at (px, py) on an element showing the SVG at `scale` screen px
 * per drawing px is at drawing point (viewBox.x + px / scale, viewBox.y + py / scale), which `screenToHex` takes.
 */
export function renderSceneFramed(input: SceneInput): FramedScene {
  const { cells, projection: p, palette, seed } = input;
  const prefix = input.idPrefix ?? 'br';
  if (!/^[\w-]+$/.test(prefix)) throw new Error(`Bad idPrefix: ${prefix}`);
  const drawers = { ...PROP_DRAWERS, ...input.overrides };
  const lite = input.effects === 'lite';
  const zoom =
    input.zoom !== undefined && Number.isFinite(input.zoom) && input.zoom > 0 ? input.zoom : 1;
  const minInkPx =
    input.minInkPx !== undefined && Number.isFinite(input.minInkPx) && input.minInkPx >= 0
      ? input.minInkPx
      : undefined;
  const ink = inkWidth(p.k, zoom, minInkPx);
  const ground = drawGround(cells, p, palette, seed, ink);
  const creature = input.creature ?? null;
  const placed: Placed[] = [];

  for (const cell of cells) {
    const state = cellState(cell);
    if (state === 'unseen' || state === 'lost') {
      if (cell.hint && state === 'unseen') {
        const c = hexCenter(p, cell.q, cell.r);
        placed.push({ at: c, drawn: hintMark(ctx(c, rngFor(seed, 'hint', cell.q, cell.r))) });
      }
      continue;
    }
    const c = hexCenter(p, cell.q, cell.r);
    const underCreature = creature !== null && hexDistance(cell, creature) <= 1;
    const rng = rngFor(seed, 'props', cell.q, cell.r);
    const spots =
      cell.props ??
      (underCreature
        ? []
        : placeProps((cell.site && SITE_PROPS[cell.site]) || terrainLook(cell.terrain).props, rng));
    const opacity = state === 'fading' ? ART_TUNING.fadingPropOpacity : undefined;
    for (const spot of spots) {
      const draw = drawers[spot.kind];
      if (!draw) continue;
      const at = onPlane(p, c, spot.dx, spot.dy);
      const propRng = rngFor(
        seed,
        'prop',
        cell.q,
        cell.r,
        spot.kind,
        Math.round(spot.dx * 1000),
        Math.round(spot.dy * 1000),
      );
      placed.push({
        at,
        drawn: draw(ctx(at, propRng, 'scale' in spot ? spot.scale : 1)),
        ...(opacity === undefined ? {} : { opacity }),
      });
    }
    if (cell.hint) {
      const at = onPlane(p, c, 0.05, 0.05);
      placed.push({ at, drawn: hintMark(ctx(at, rngFor(seed, 'hint', cell.q, cell.r))) });
    }
  }

  if (creature) {
    const c = onPlane(p, hexCenter(p, creature.q, creature.r), 0, 0.12);
    placed.push({
      at: c,
      drawn: drawCreature(palette, creature.look, c, p.size, p.squash, ink, creature.facing),
    });
  }
  const sites = new Set(cells.filter((c) => c.site).map((c) => `${c.q},${c.r}`));
  const perTile = new Map<string, number>();
  for (const ch of input.characters ?? []) {
    const key = `${ch.q},${ch.r}`;
    const index = perTile.get(key) ?? 0;
    perTile.set(key, index + 1);
    // Beside a site, stand to its front left; otherwise near the middle.
    const dx = (sites.has(key) ? -0.5 : -0.05) + index * 0.32;
    const c = onPlane(p, hexCenter(p, ch.q, ch.r), dx, 0.3 - index * 0.06);
    placed.push({ at: c, drawn: drawCharacter(palette, ch.accent, c, p.size, p.squash, ink) });
  }

  placed.sort((a, b) => drawOrder(a.at, b.at));
  const objects: SvgNode[] = placed.flatMap(({ drawn, opacity }) =>
    opacity === undefined ? drawn.nodes : [el('g', { opacity }, drawn.nodes)],
  );

  const boxes: Box[] = [...ground.boxes, ...placed.map((x) => x.drawn.box)];
  const box = boxes.length ? unionBox(boxes) : { x0: 0, y0: 0, x1: p.size, y1: p.size };
  const pad = ART_TUNING.padding * p.size;
  const x = Math.floor(box.x0 - pad);
  const y = Math.floor(box.y0 - pad);
  const w = Math.ceil(box.x1 + pad) - x;
  const h = Math.ceil(box.y1 + pad) - y;
  const frame = { x, y, width: w, height: h };

  const svg = el('svg', { viewBox: `${x} ${y} ${w} ${h}`, width: w, height: h }, [
    artDefs(palette, prefix, p.k, !lite),
    el('rect', { ...frame, fill: palette.paper }),
    el('rect', { ...frame, fill: refUrl(prefix, 'vignette') }),
    el('g', lite ? {} : { filter: refUrl(prefix, 'wash') }, ground.ground),
    ...ground.crisp,
    el(
      'g',
      lite
        ? { 'data-layer': 'objects' }
        : { 'data-layer': 'objects', filter: refUrl(prefix, 'ink') },
      objects,
    ),
    ...(lite
      ? []
      : [el('rect', { ...frame, fill: palette.paper, filter: refUrl(prefix, 'grain') })]),
  ]);
  return { svg, viewBox: frame };

  function ctx(origin: Point, rng: Rng, scale = 1) {
    return { palette, rng, origin, k: p.k * scale, squash: p.squash, ink: ink * scale };
  }
}
