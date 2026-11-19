/**
 * Interface marks drawn on the map in the art kit's ink-and-wash language, as `SvgNode` trees in world px:
 * reachable tiles, the selection, the planned path with its action pips, the creature's likely next steps
 * and lost characters. Colours come only from the palette. The lead may move these into the art kit.
 *
 * `under` sits on the ground (beneath props and figures); `over` sits on top of everything.
 */
import {
  accentRamp,
  ART_TUNING,
  DIRECTIONS,
  drawCharacter,
  el,
  hexCenter,
  hexCorners,
  type Palette,
  type Projection,
  type SvgNode,
} from '@behemoth-road/art';
import {
  type CreatureStepOption,
  directionOffset,
  type GameState,
  type Hex,
  type PathStep,
  type Place,
  type ReachablePlace,
  creatureHexes,
  hexKey,
  placeHex,
} from '@behemoth-road/core';
import { cellStateAt } from './cells.ts';
import { MAP_TUNING } from './config.ts';
import { figureFeet, placePoint } from './figures.ts';
import { type Flow, isSelecting } from './flow.ts';
import { feetOf, type Point } from './pick.ts';

export interface OverlayInput {
  readonly state: GameState;
  readonly flow: Flow;
  readonly characterId: string;
  readonly reachable: readonly ReachablePlace[];
  readonly predicted: readonly CreatureStepOption[];
  readonly projection: Projection;
  readonly palette: Palette;
  /** Screen px per world px the map settles at (default 1); keeps key marks legible when zoomed out. */
  readonly zoom?: number;
}

export interface Overlays {
  readonly under: SvgNode[];
  readonly over: SvgNode[];
}

const n = (v: number): string => (Math.round(v * 10) / 10).toString();

function hexPath(p: Projection, h: Hex, scale: number): string {
  const pts = hexCorners(p, hexCenter(p, h.q, h.r), scale);
  return `M${pts.map((q) => `${n(q.x)} ${n(q.y)}`).join('L')}Z`;
}

function ellipse(c: Point, rx: number, ry: number): string {
  return `M${n(c.x - rx)} ${n(c.y)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
}

const dashed = (i: OverlayInput): Record<string, string | number> => ({
  fill: 'none',
  stroke: i.palette.inkSoft,
  'stroke-width': 1.2 * i.projection.k,
  'stroke-dasharray': `${n(3 * i.projection.k)} ${n(4 * i.projection.k)}`,
  'stroke-linejoin': 'round',
  opacity: 0.8,
});

/** The creature's footprint as one shape: all its hexes filled as one path, and its outer edge. */
function footprint(i: OverlayInput): { fill: string; edge: string } {
  const p = i.projection;
  const hexes = creatureHexes(i.state);
  const inside = new Set(hexes.map(hexKey));
  let edge = '';
  for (const h of hexes) {
    const corners = hexCorners(p, hexCenter(p, h.q, h.r));
    DIRECTIONS.forEach((d, e) => {
      if (inside.has(hexKey({ q: h.q + d.q, r: h.r + d.r }))) return;
      const a = corners[e]!;
      const b = corners[(e + 1) % 6]!;
      edge += `M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`;
    });
  }
  return { fill: hexes.map((h) => hexPath(p, h, 1)).join(''), edge };
}

/**
 * Reachable places: a soft light wash with a faint dashed ink edge. Hexes are lit one by one; the creature
 * is lit as one place, with a single outline around its footprint.
 */
function reachableWash(i: OverlayInput): SvgNode[] {
  if (i.reachable.length === 0) return [];
  const hexes = i.reachable.flatMap((r) => (r.place.kind === 'hex' ? [r.place.hex] : []));
  const d = hexes.map((h) => hexPath(i.projection, h, 0.86)).join('');
  const out: SvgNode[] = [];
  if (d) {
    out.push(
      el('path', { d, fill: i.palette.paper, opacity: 0.42 }),
      el('path', { d, ...dashed(i) }),
    );
  }
  if (i.reachable.some((r) => r.place.kind === 'creature')) {
    const f = footprint(i);
    out.push(
      el('path', { d: f.fill, fill: i.palette.paper, opacity: 0.32 }),
      el('path', { d: f.edge, ...dashed(i), 'stroke-width': 1.6 * i.projection.k }),
    );
  }
  return out;
}

function hexOutline(i: OverlayInput, h: Hex, colour: string, width: number): SvgNode {
  return el('path', {
    d: hexPath(i.projection, h, 0.92),
    fill: 'none',
    stroke: colour,
    'stroke-width': width * i.projection.k,
    'stroke-linejoin': 'round',
  });
}

/** The outline of a place: a hex, or the whole footprint for the creature. */
function placeOutline(i: OverlayInput, place: Place, colour: string, width: number): SvgNode {
  if (place.kind === 'hex') return hexOutline(i, place.hex, colour, width);
  return el('path', {
    d: footprint(i).edge,
    fill: 'none',
    stroke: colour,
    'stroke-width': width * i.projection.k,
    'stroke-linecap': 'round',
  });
}

/**
 * A ring at the selected character's feet: a soft disc on the ground for a character on a hex; for a
 * rider, an outline only, drawn over the creature so its back does not hide it.
 */
function selectionRing(i: OverlayInput, feet: Point, riding: boolean): SvgNode {
  const p = i.projection;
  const ramp = accentRamp(i.palette, MAP_TUNING.accent);
  const scale = riding ? 0.22 : 0.3;
  return el('path', {
    d: ellipse(feet, scale * p.size, scale * p.size * p.squash),
    fill: riding ? 'none' : ramp.light,
    'fill-opacity': 0.5,
    stroke: ramp.shade,
    'stroke-width': 2 * p.k,
  });
}

/** Faint paw prints where the creature's front would be after each likely step, stronger when likelier. */
function creatureHints(i: OverlayInput): SvgNode[] {
  const p = i.projection;
  const out: SvgNode[] = [];
  // One hex beyond the front of the footprint it would step into, clear of the creature's body.
  const reach = i.state.config.creatureRadius + 1;
  const from = hexCenter(p, i.state.creature.centre.q, i.state.creature.centre.r);
  for (const option of i.predicted) {
    const o = directionOffset(option.direction);
    const target = hexCenter(p, option.centre.q + o.q * reach, option.centre.r + o.r * reach);
    const angle = Math.atan2(target.y - from.y, target.x - from.x);
    out.push(pawPrint(i, target, angle, 0.25 + 0.6 * option.chance));
  }
  return out;
}

function pawPrint(i: OverlayInput, at: Point, angle: number, opacity: number): SvgNode {
  const p = i.projection;
  const s = p.size * 0.11;
  const rot = (dx: number, dy: number): Point => ({
    x: at.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * s,
    y: at.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * s * p.squash,
  });
  const pad = ellipse(rot(-0.6, 0), 1.25 * s, 1.05 * s * p.squash);
  const toes = [
    [1.15, -1.25],
    [1.6, 0],
    [1.15, 1.25],
  ]
    .map(([dx, dy]) => ellipse(rot(dx!, dy!), 0.5 * s, 0.5 * s * p.squash))
    .join('');
  return el('path', { d: pad + toes, fill: i.palette.inkSoft, opacity: n(opacity) });
}

/** The planned path: a dashed ink line with an arrowhead, a pip per action, and a mark where a step has `via`. */
function pathArrow(i: OverlayInput, from: Point, steps: readonly PathStep[]): SvgNode[] {
  const p = i.projection;
  const k = p.k;
  // On the creature, the arrow runs to (or from) the seat the character has or would take.
  const pts = [from, ...steps.map((s) => placePoint(i.state, i.characterId, s.place, p))];
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  // Stop the line short of the destination so the arrowhead tip lands on it.
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const head = 11 * k;
  const tip = last;
  const base = { x: tip.x - Math.cos(angle) * head, y: tip.y - Math.sin(angle) * head };
  const line = [...pts.slice(0, -1), base];
  const out: SvgNode[] = [
    el('path', {
      d: `M${line.map((q) => `${n(q.x)} ${n(q.y)}`).join('L')}`,
      fill: 'none',
      stroke: i.palette.ink,
      'stroke-width': 2.6 * k,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': `${n(8 * k)} ${n(6 * k)}`,
    }),
    el('path', {
      d: `M${n(base.x - Math.sin(angle) * head * 0.6)} ${n(base.y + Math.cos(angle) * head * 0.6)}L${n(tip.x)} ${n(tip.y)}L${n(base.x + Math.sin(angle) * head * 0.6)} ${n(base.y - Math.cos(angle) * head * 0.6)}Z`,
      fill: i.palette.ink,
      stroke: i.palette.ink,
      'stroke-width': 1.5 * k,
      'stroke-linejoin': 'round',
    }),
  ];
  steps.forEach((step, index) => {
    const a = pts[index]!;
    const b = pts[index + 1]!;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (step.via) out.push(viaMark(i, midpoint));
    out.push(...pips(i, { x: midpoint.x, y: midpoint.y - 12 * k }, step.cost));
  });
  return out;
}

/** A small ring on the stretch that relies on something special (rope, boat...). None in Milestone 1. */
function viaMark(i: OverlayInput, at: Point): SvgNode {
  const k = i.projection.k;
  return el('path', {
    d: ellipse(at, 6 * k, 6 * k),
    fill: i.palette.paper,
    stroke: i.palette.ink,
    'stroke-width': 1.6 * k,
  });
}

/** Action pips in a row centred on `at`, drawn in the character's accent with an ink rim. */
export function pips(i: OverlayInput, at: Point, count: number): SvgNode[] {
  const k = i.projection.k;
  const r = 4.6 * k;
  const gap = 11 * k;
  const ramp = accentRamp(i.palette, MAP_TUNING.accent);
  const out: SvgNode[] = [];
  for (let j = 0; j < count; j += 1) {
    const x = at.x + (j - (count - 1) / 2) * gap;
    out.push(
      el('path', {
        d: ellipse({ x, y: at.y }, r, r),
        fill: ramp.base,
        stroke: i.palette.ink,
        'stroke-width': 1.4 * k,
      }),
    );
  }
  return out;
}

/** A lost character: its standee faded into the fog. */
function lostCharacters(i: OverlayInput): SvgNode[] {
  const p = i.projection;
  return i.state.characters
    .filter((c) => c.status === 'lost')
    .flatMap((c) => {
      const at = feetOf(p, placeHex(i.state, c.at));
      const drawn = drawCharacter(
        i.palette,
        MAP_TUNING.accent,
        at,
        p.size,
        p.squash,
        ART_TUNING.inkWidth * p.k,
      );
      return [
        el('g', { opacity: 0.38 }, drawn.nodes),
        el('path', {
          d: ellipse({ x: at.x, y: at.y - 0.2 * p.size }, 0.42 * p.size, 0.34 * p.size),
          fill: i.palette.fog,
          opacity: 0.55,
        }),
      ];
    });
}

/** The hexes in their grace day: seen, out of the window, lost at the next tick. */
function graceHexes(i: OverlayInput): Hex[] {
  return Object.keys(i.state.tiles)
    .filter((key) => cellStateAt(i.state, key) === 'fading')
    .map((key) => {
      const [q, r] = key.split(',').map(Number) as [number, number];
      return { q, r };
    });
}

/** Grace-day tiles read as "last chance": a paler wash and a dashed ink edge on each, in one path each. */
/** A width in world px that is at least `screenPx` on screen at the settled zoom. */
const atLeast = (i: OverlayInput, world: number, screenPx: number): number =>
  Math.max(world, screenPx / (i.zoom ?? 1));

function graceTiles(i: OverlayInput, hexes: readonly Hex[]): SvgNode[] {
  if (hexes.length === 0) return [];
  const k = i.projection.k;
  const w = atLeast(i, 1.6 * k, 1.3);
  const d = hexes.map((h) => hexPath(i.projection, h, 0.9)).join('');
  return [
    el('path', { d, fill: i.palette.paper, opacity: 0.4, 'data-mark': 'grace' }),
    el('path', {
      d,
      fill: 'none',
      stroke: i.palette.ink,
      'stroke-width': w,
      'stroke-dasharray': `${n(1.5 * w)} ${n(3.5 * w)}`,
      'stroke-linecap': 'round',
      opacity: 0.75,
    }),
  ];
}

/** A small hourglass above a figure on a grace-day tile: time is running out here. No words. */
function graceWarning(i: OverlayInput, feet: Point): SvgNode {
  const p = i.projection;
  // The disc is 3.8 × 7k across: at least about 16 screen px, wherever the zoom settles.
  const k = atLeast(i, p.k, 0.6);
  const s = 7 * k;
  const cx = feet.x + 0.2 * p.size;
  const cy = feet.y - 0.95 * p.size;
  const glass = `M${n(cx - s)} ${n(cy - s)}L${n(cx + s)} ${n(cy - s)}L${n(cx - s)} ${n(cy + s)}L${n(cx + s)} ${n(cy + s)}Z`;
  return el('g', { 'data-mark': 'grace-warning' }, [
    el('path', {
      d: ellipse({ x: cx, y: cy }, s * 1.9, s * 1.9),
      fill: i.palette.paper,
      stroke: i.palette.hint,
      'stroke-width': 1.6 * k,
    }),
    el('path', {
      d: glass,
      fill: i.palette.hint,
      stroke: i.palette.ink,
      'stroke-width': 1.3 * k,
      'stroke-linejoin': 'round',
    }),
  ]);
}

export function buildOverlays(i: OverlayInput): Overlays {
  const under: SvgNode[] = [];
  const over: SvgNode[] = [];
  const me = i.state.characters.find((c) => c.id === i.characterId);
  under.push(...creatureHints(i));
  const grace = graceHexes(i);
  under.push(...graceTiles(i, grace));
  const feet = figureFeet(i.state, i.characterId, i.projection);
  const riding = me?.at.kind === 'creature';
  if (isSelecting(i.flow) && feet) {
    under.push(...reachableWash(i));
    (riding ? over : under).push(selectionRing(i, feet, riding));
  }
  if (i.flow.kind === 'inspect') under.push(hexOutline(i, i.flow.hex, i.palette.ink, 2.2));
  if (i.flow.kind === 'creature' || i.flow.kind === 'bubble') {
    under.push(placeOutline(i, { kind: 'creature' }, i.palette.ink, 2.2));
  }
  if (i.flow.kind === 'planned' && feet) {
    under.push(placeOutline(i, i.flow.to, accentRamp(i.palette, MAP_TUNING.accent).shade, 2.6));
    over.push(...pathArrow(i, feet, i.flow.steps));
  }
  over.push(...lostCharacters(i));
  const standing = me?.status === 'active' && me.at.kind === 'hex' ? me.at.hex : null;
  if (feet && standing && grace.some((h) => h.q === standing.q && h.r === standing.r)) {
    over.push(graceWarning(i, feet));
  }
  return { under, over };
}
