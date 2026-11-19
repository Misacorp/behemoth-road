/** A map patch as one SVG: paper, the ground under the wash filter, then every upright thing back to front. */
import { DEFAULT_LOOK, drawCharacter, type CharacterArt } from './character.ts';
import { ART_TUNING } from './config.ts';
import { drawCreature, inFootprint, riderAnchor, type CreatureArt } from './creature.ts';
import { featureDrawer } from './features.ts';
import { figureAnchor } from './figure.ts';
import { artDefs, refUrl } from './filters.ts';
import { ellipsePath, unionBox, type Box, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import {
  drawOrder,
  hexCenter,
  hexDistance,
  hexKey,
  onPlane,
  type Hex,
  type Projection,
} from './projection.ts';
import {
  hintMark,
  inkWidth,
  riseFor,
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
  /**
   * `page` (default) frames the scene as a picture: paper, an edge vignette and paper grain over its box.
   * `none` leaves all three out, for a map that pans, where the box's edge would show; draw `paperGrain`
   * over the screen instead.
   */
  readonly frame?: 'page' | 'none';
  /** More hexes drawn as trodden ground, as if a creature stood there (review sheets). */
  readonly occupied?: readonly Hex[];
}

interface Placed {
  readonly at: Point;
  readonly drawn: Drawn;
  readonly opacity?: number;
  /** Sort at this screen y instead of `at.y` (riders sort just after the creature, among themselves by depth). */
  readonly after?: number;
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

/**
 * Rider slots by character id: the characters `isRider` picks, numbered in the order given. The scene seats
 * riders with this, and the map uses it to find a rider's figure (and the seat a boarding character takes).
 */
export function riderSeats<T extends { readonly id: string }>(
  characters: readonly T[],
  isRider: (c: T) => boolean,
): Map<string, number> {
  const seats = new Map<string, number>();
  for (const c of characters) if (isRider(c)) seats.set(c.id, seats.size);
  return seats;
}

export interface FramedScene {
  readonly svg: SvgNode;
  readonly viewBox: SceneFrame;
  /** Where each character's figure was drawn (its feet), by id, in drawing coordinates. */
  readonly figures: ReadonlyMap<string, Point>;
}

/** The scene as an SVG tree. */
export function renderScene(input: SceneInput): SvgNode {
  return renderSceneFramed(input).svg;
}

/**
 * The scene and its frame as numbers. A pointer at (px, py) on an element showing the SVG at `scale` screen px
 * per drawing px is at drawing point (viewBox.x + px / scale, viewBox.y + py / scale), which `screenToHex` takes.
 */
/**
 * The paper grain layer. By default it fills its viewport (`width`/`height` 100%), for drawing over a whole
 * screen; it needs the filter defs of a scene drawn with the same `idPrefix` and full effects.
 */
export function paperGrain(
  palette: Palette,
  idPrefix = 'br',
  box: { x: number; y: number; width: number | string; height: number | string } = {
    x: 0,
    y: 0,
    width: '100%',
    height: '100%',
  },
): SvgNode {
  return el('rect', { ...box, fill: palette.paper, filter: refUrl(idPrefix, 'grain') });
}

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
  const creatureIn = input.creature ?? null;
  const occupied = new Set([
    ...(creatureIn
      ? cells.filter((c) => inFootprint(creatureIn, c)).map((c) => hexKey(c.q, c.r))
      : []),
    ...(input.occupied ?? []).map((h) => hexKey(h.q, h.r)),
  ]);
  const ground = drawGround(cells, p, palette, seed, ink, occupied, prefix);
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
      (cell.feature && !underCreature ? [] : undefined) ??
      (underCreature
        ? []
        : placeProps((cell.site && SITE_PROPS[cell.site]) || terrainLook(cell.terrain).props, rng));
    const opacity =
      state === 'fading'
        ? ART_TUNING.fadingPropOpacity
        : state === 'unexplored'
          ? ART_TUNING.veilPropOpacity
          : undefined;
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
    if (cell.feature && !underCreature && state !== 'unexplored') {
      const at = onPlane(p, c, 0, 0.08);
      const draw = featureDrawer(cell.feature.look);
      const drawn = draw(
        ctx(at, rngFor(seed, 'feature', cell.q, cell.r), ART_TUNING.featureScale),
        cell.feature.state ?? 'ready',
      );
      placed.push({ at, drawn, ...(opacity === undefined ? {} : { opacity }) });
    }
    if (cell.hint) {
      const at = onPlane(p, c, 0.05, 0.05);
      placed.push({ at, drawn: hintMark(ctx(at, rngFor(seed, 'hint', cell.q, cell.r))) });
    }
  }

  if (creature) {
    const c = hexCenter(p, creature.q, creature.r);
    placed.push({
      at: c,
      drawn: drawCreature(
        palette,
        creature.look,
        c,
        p.size,
        p.squash,
        ink,
        creature.heading,
        creature.stores ?? 0,
      ),
    });
  }
  const sites = new Set(cells.filter((c) => c.site).map((c) => `${c.q},${c.r}`));
  const perTile = new Map<string, number>();
  const seats = creature
    ? riderSeats(input.characters ?? [], (ch) => inFootprint(creature, ch))
    : new Map<string, number>();
  const figures = new Map<string, Point>();
  for (const ch of input.characters ?? []) {
    const seat = seats.get(ch.id);
    if (creature && seat !== undefined) {
      // A rider: standing on the creature's back in the next free slot, with a firm contact shadow.
      const c = riderAnchor(
        creature.look,
        creature.heading,
        seat,
        hexCenter(p, creature.q, creature.r),
        p.size,
        p.squash,
      );
      figures.set(ch.id, c);
      const drawn = drawCharacter(
        palette,
        ch.accent,
        c,
        p.size,
        p.squash,
        ink,
        ch.look ?? DEFAULT_LOOK,
      );
      const contact = el('path', {
        d: ellipsePath(
          c.x + 0.02 * p.size,
          c.y + 0.01 * p.size,
          0.17 * p.size,
          0.06 * p.size * (p.squash / 0.6),
        ),
        fill: palette.shadow,
        opacity: 0.38,
      });
      const creatureY = hexCenter(p, creature.q, creature.r).y;
      placed.push({
        at: c,
        drawn: { nodes: [contact, ...drawn.nodes], box: drawn.box },
        after: creatureY + 1e-3 + (c.y - creatureY + p.size * 10) * 1e-6,
      });
      continue;
    }
    const key = `${ch.q},${ch.r}`;
    const index = perTile.get(key) ?? 0;
    perTile.set(key, index + 1);
    const c = figureAnchor(p, ch, index, { site: sites.has(key) });
    figures.set(ch.id, c);
    placed.push({
      at: c,
      drawn: drawCharacter(palette, ch.accent, c, p.size, p.squash, ink, ch.look ?? DEFAULT_LOOK),
    });
  }

  const sortAt = (x: Placed): Point => (x.after === undefined ? x.at : { x: x.at.x, y: x.after });
  placed.sort((a, b) => drawOrder(sortAt(a), sortAt(b)));
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

  const page = input.frame !== 'none';
  const svg = el('svg', { viewBox: `${x} ${y} ${w} ${h}`, width: w, height: h }, [
    artDefs(palette, prefix, p.k, !lite),
    ...(page
      ? [
          el('rect', { ...frame, fill: palette.paper }),
          el('rect', { ...frame, fill: refUrl(prefix, 'vignette') }),
        ]
      : []),
    el('g', lite ? {} : { filter: refUrl(prefix, 'wash') }, ground.ground),
    ...ground.crisp,
    el(
      'g',
      lite
        ? { 'data-layer': 'objects' }
        : { 'data-layer': 'objects', filter: refUrl(prefix, 'ink') },
      objects,
    ),
    ...(lite || !page ? [] : [paperGrain(palette, prefix, frame)]),
  ]);
  return { svg, viewBox: frame, figures };

  function ctx(origin: Point, rng: Rng, scale = 1) {
    return {
      palette,
      rng,
      origin,
      k: p.k * scale,
      squash: p.squash,
      ink: ink * scale,
      rise: riseFor(p.squash),
    };
  }
}
