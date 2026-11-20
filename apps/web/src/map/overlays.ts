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
  drawEscortRing,
  drawStayMark,
  drawStepHint,
  drawIcon,
  drawViaMark,
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
  type GameStateView,
  type Hex,
  type PathStep,
  type Place,
  type ReachablePlace,
  checkAction,
  creatureHexes,
  featureType,
  hexDistance,
  hexesInRange,
  hexKey,
  placeHex,
} from '@behemoth-road/core';
import { drawExploredEmpty, drawMisledMark } from './art.ts';
import { accentOf } from '../game/identity.ts';
import { escortCentres, threatNextPath } from '../game/season.ts';
import { cellStateAt } from './cells.ts';
import { MAP_TUNING } from './config.ts';
import { figureFeet, placePoint } from './figures.ts';
import { type Flow, isSelecting } from './flow.ts';
import { feetOf, type Point } from './pick.ts';

export interface OverlayInput {
  readonly state: GameStateView;
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
  const ramp = accentRamp(i.palette, accentOf(i.characterId, MAP_TUNING.accent));
  const scale = riding ? 0.22 : 0.3;
  return el('path', {
    d: ellipse(feet, scale * p.size, scale * p.size * p.squash),
    fill: riding ? 'none' : ramp.light,
    'fill-opacity': 0.5,
    stroke: ramp.shade,
    'stroke-width': 2 * p.k,
  });
}

/** Whether the prediction is the creature staying put (it lingers): the core's `stay` option. */
export const staysPut = (predicted: readonly CreatureStepOption[]): boolean =>
  predicted.some((o) => o.stay === true);

/**
 * The stay mark for a lingering creature, instead of the paw prints ahead: on its footprint's near edge
 * (the hex below its centre on screen), so the body and riders do not hide it.
 */
export function stayHint(i: OverlayInput): SvgNode {
  const p = i.projection;
  const { centre } = i.state.creature;
  const at = hexCenter(p, centre.q, centre.r + i.state.config.creatureRadius);
  const size = Math.max(1.1 * p.size, 40 / (i.zoom ?? 1));
  const mark = drawStayMark(i.palette, size);
  return el(
    'svg',
    {
      ...mark.attrs,
      x: at.x - size / 2,
      y: at.y - size / 2,
      width: size,
      height: size,
      'data-mark': 'stay',
    },
    [...mark.children],
  );
}

/**
 * Paw prints where the creature's front would be after each possible step (left, straight, right, as the
 * core's blind prediction gives them), larger and darker the likelier the step, so a veer reads at a glance.
 */
function creatureHints(i: OverlayInput): SvgNode[] {
  const p = i.projection;
  const out: SvgNode[] = [];
  if (staysPut(i.predicted)) return [];
  // One hex beyond the front of the footprint it would step into, clear of the creature's body.
  const reach = i.state.config.creatureRadius + 1;
  const from = hexCenter(p, i.state.creature.centre.q, i.state.creature.centre.r);
  for (const option of i.predicted) {
    const o = directionOffset(option.direction);
    const target = hexCenter(p, option.centre.q + o.q * reach, option.centre.r + o.r * reach);
    const angle = Math.atan2(target.y - from.y, target.x - from.x);
    out.push(stepHint(i, target, angle, option.chance, option.direction));
  }
  return out;
}

/**
 * The art kit's step hint (a paw print pointing the walk, larger and darker the likelier the step), centred
 * on `at`, at least about 26 screen px across whatever the zoom.
 */
function stepHint(
  i: OverlayInput,
  at: Point,
  angle: number,
  chance: number,
  direction: string,
): SvgNode {
  const size = atLeast(i, 0.9 * i.projection.size, 26);
  const mark = drawStepHint(i.palette, size, chance, angle);
  return el(
    'svg',
    {
      ...mark.attrs,
      x: at.x - size / 2,
      y: at.y - size / 2,
      width: size,
      height: size,
      'data-mark': `step:${direction}`,
    },
    [...mark.children],
  );
}

/**
 * A dashed ink line through `pts` with an arrowhead whose tip lands on the last point: the planned path's
 * arrow, also the threat trail. `inset` pulls the line's start off the first point (off a drawn mark).
 */
function inkArrow(
  i: OverlayInput,
  pts: readonly Point[],
  opts: { inset?: number; width?: number; mark?: string } = {},
): SvgNode[] {
  const k = i.projection.k;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  // Stop the line short of the destination so the arrowhead tip lands on it.
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const head = 11 * k;
  const tip = last;
  const base = { x: tip.x - Math.cos(angle) * head, y: tip.y - Math.sin(angle) * head };
  const first = pts[0]!;
  const second = pts[1]!;
  const inset = opts.inset ?? 0;
  const lead = Math.atan2(second.y - first.y, second.x - first.x);
  const start = { x: first.x + Math.cos(lead) * inset, y: first.y + Math.sin(lead) * inset };
  const line = [start, ...pts.slice(1, -1), base];
  const tag = opts.mark ? { 'data-mark': opts.mark } : {};
  return [
    el('path', {
      d: `M${line.map((q) => `${n(q.x)} ${n(q.y)}`).join('L')}`,
      fill: 'none',
      stroke: i.palette.ink,
      'stroke-width': (opts.width ?? 2.6) * k,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': `${n(8 * k)} ${n(6 * k)}`,
      ...tag,
    }),
    el('path', {
      d: `M${n(base.x - Math.sin(angle) * head * 0.6)} ${n(base.y + Math.cos(angle) * head * 0.6)}L${n(tip.x)} ${n(tip.y)}L${n(base.x + Math.sin(angle) * head * 0.6)} ${n(base.y - Math.cos(angle) * head * 0.6)}Z`,
      fill: i.palette.ink,
      stroke: i.palette.ink,
      'stroke-width': 1.5 * k,
      'stroke-linejoin': 'round',
      ...tag,
    }),
  ];
}

/** The planned path: a dashed ink line with an arrowhead, a pip per action, and a mark where a step has `via`. */
function pathArrow(i: OverlayInput, from: Point, steps: readonly PathStep[]): SvgNode[] {
  const p = i.projection;
  const k = p.k;
  // On the creature, the arrow runs to (or from) the seat the character has or would take.
  const pts = [from, ...steps.map((s) => placePoint(i.state, i.characterId, s.place, p))];
  const out = inkArrow(i, pts);
  steps.forEach((step, index) => {
    const a = pts[index]!;
    const b = pts[index + 1]!;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (step.via) out.push(...viaMark(i, midpoint, step.via));
    out.push(...pips(i, { x: midpoint.x, y: midpoint.y - 12 * k }, step.cost));
  });
  return out;
}

/**
 * The mark on a stretch that relies on something special: the art kit's `via` mark (a grappling hook on a
 * paper disc for a cliff step), so the means of travel shows in the arrow itself. Unknown ids draw a dot.
 */
function viaMark(i: OverlayInput, at: Point, via: string): SvgNode[] {
  const size = 24 * i.projection.k;
  const mark = drawViaMark(via, i.palette, size);
  return [
    el(
      'svg',
      {
        ...mark.attrs,
        x: at.x - size / 2,
        y: at.y - size / 2,
        width: size,
        height: size,
        'data-mark': `via:${via}`,
      },
      [...mark.children],
    ),
  ];
}

/** Action pips in a row centred on `at`, drawn in the character's accent with an ink rim. */
export function pips(i: OverlayInput, at: Point, count: number): SvgNode[] {
  const k = i.projection.k;
  const r = 4.6 * k;
  const gap = 11 * k;
  const ramp = accentRamp(i.palette, accentOf(i.characterId, MAP_TUNING.accent));
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

/**
 * An open threat card's trail: where the threat walks at the next tick (`threatNextPath`), as the ink arrow
 * from its hex, and its end hex ringed. Nothing when it does not move.
 */
export function threatTrail(i: OverlayInput, threatId: string): SvgNode[] {
  const threat = i.state.threats.find((t) => t.id === threatId);
  const path = threatNextPath(i.state, threatId);
  const end = path.at(-1);
  if (!threat || !end) return [];
  const p = i.projection;
  const pts = [threat.hex, ...path].map((h) => hexCenter(p, h.q, h.r));
  return [
    el('path', {
      d: hexPath(p, end, 0.8),
      fill: 'none',
      stroke: i.palette.ink,
      'stroke-width': 1.8 * p.k,
      'stroke-dasharray': `${n(3 * p.k)} ${n(3 * p.k)}`,
      'stroke-linejoin': 'round',
      'data-mark': 'threat-end',
    }),
    ...inkArrow(i, pts, { inset: 16 * p.k, width: 2.2, mark: 'threat-trail' }),
  ];
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
        accentOf(c.id, MAP_TUNING.accent),
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

/**
 * The window's edge: a faint dashed ink line around the hexes in reach of the creature, always shown, so
 * "too far" can be seen before a character is left behind. One path of the outer hex edges.
 */
function windowEdge(i: OverlayInput): SvgNode {
  const p = i.projection;
  const centre = i.state.creature.centre;
  const radius = i.state.config.windowRadius;
  const segments: string[] = [];
  for (const h of hexesInRange(centre, radius)) {
    if (hexDistance(h, centre) !== radius) continue;
    const c = hexCenter(p, h.q, h.r);
    const corners = hexCorners(p, c);
    for (let k = 0; k < 6; k += 1) {
      const a = corners[k]!;
      const b = corners[(k + 1) % 6]!;
      // The hex across this edge: its centre mirrors this one through the edge's midpoint.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const across = { x: 2 * mx - c.x, y: 2 * my - c.y };
      const q = Math.round(across.x / (1.5 * p.size));
      const r = Math.round(across.y / (Math.sqrt(3) * p.size * p.squash) - q / 2);
      if (hexDistance({ q, r }, centre) > radius) {
        segments.push(`M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`);
      }
    }
  }
  const w = atLeast(i, 1.4 * p.k, 1.1);
  return el('path', {
    d: segments.join(''),
    fill: 'none',
    stroke: i.palette.ink,
    'stroke-width': w,
    'stroke-dasharray': `${n(4 * w)} ${n(4 * w)}`,
    'stroke-linecap': 'round',
    opacity: 0.35,
    'data-mark': 'window-edge',
  });
}

/** An art kit icon as a centred `<svg>` of `size` world px, with an optional opacity. */
function iconAt(i: OverlayInput, icon: string, at: Point, size: number, opacity = 1): SvgNode {
  const node = drawIcon(icon, i.palette, size);
  return el(
    'svg',
    {
      ...node.attrs,
      x: at.x - size / 2,
      y: at.y - size / 2,
      width: size,
      height: size,
      ...(opacity < 1 ? { opacity } : {}),
    },
    [...node.children],
  );
}

/** The action glyph a feature offers: an open hand to gather at a node, a key to work a site. */
const ACTION_GLYPH: Readonly<Record<string, string>> = { node: 'hand', site: 'key' };

/**
 * Hints at what can be done near you: a small badge with the action glyph on each explored node or site
 * (with something left) where you stand or next to you, and, while your character is selected, a faint
 * spyglass on each unexplored neighbour you could survey. Only the glyphs; what they do is for the player
 * to find out.
 */
function actionHints(i: OverlayInput): SvgNode[] {
  const me = i.state.characters.find((c) => c.id === i.characterId);
  if (me?.status !== 'active' || me.at.kind !== 'hex') return [];
  const here = me.at.hex;
  const p = i.projection;
  const size = atLeast(i, 0.42 * p.size, 18);
  const out: SvgNode[] = [];
  for (const h of hexesInRange(here, 1)) {
    const f = i.state.features[hexKey(h)];
    if (!f?.revealed || f.left <= 0) continue;
    let glyph: string | undefined;
    try {
      glyph = ACTION_GLYPH[featureType(f.type).kind];
    } catch {
      continue;
    }
    if (!glyph) continue;
    const c = hexCenter(p, h.q, h.r);
    const at = { x: c.x + 0.45 * p.size, y: c.y - 0.55 * p.size };
    out.push(el('g', { 'data-mark': `action:${glyph}` }, [iconAt(i, glyph, at, size)]));
  }
  // Milestone 5: a strike badge on each threat you could strike (on or next to it), and on a settlement
  // where you stand or next to you, what it offers: a parley while wary, a boon once friendly.
  for (const t of i.state.threats) {
    const check = checkAction(i.state, me.id, { kind: 'strike', threat: t.id });
    if (!check.ok && check.reason !== 'not-enough-actions') continue;
    const c = hexCenter(p, t.hex.q, t.hex.r);
    const at = { x: c.x + 0.45 * p.size, y: c.y - 0.95 * p.size };
    out.push(el('g', { 'data-mark': 'action:strike' }, [iconAt(i, 'strike', at, size)]));
  }
  for (const s of i.state.settlements) {
    if (hexDistance(s.hex, here) > 1) continue;
    const glyph =
      s.attitude === 'wary'
        ? 'parley'
        : s.attitude === 'friendly' && s.boon === null
          ? 'gift'
          : null;
    if (!glyph) continue;
    const c = hexCenter(p, s.hex.q, s.hex.r);
    const at = { x: c.x + 0.5 * p.size, y: c.y - 0.85 * p.size };
    out.push(el('g', { 'data-mark': `action:${glyph}` }, [iconAt(i, glyph, at, size)]));
  }
  if (i.flow.kind === 'selected') {
    for (const h of hexesInRange(here, 1)) {
      if (hexDistance(h, here) !== 1) continue;
      if (!checkAction(i.state, me.id, { kind: 'survey', hex: h }).ok) continue;
      const c = hexCenter(p, h.q, h.r);
      out.push(el('g', { 'data-mark': 'survey-hint' }, [iconAt(i, 'spyglass', c, size, 0.45)]));
    }
  }
  return out;
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

/**
 * Explored hexes known to hold nothing (no feature, settlement, threat or fire): the faint explored-empty
 * mark, so a survey that found nothing leaves a trace. The creature's own hexes are left out.
 */
export function exploredEmpty(i: OverlayInput): SvgNode[] {
  const s = i.state;
  const taken = new Set<string>([
    ...creatureHexes(s).map(hexKey),
    ...s.settlements.map((x) => hexKey(x.hex)),
    ...s.threats.map((t) => hexKey(t.hex)),
    ...s.stimuli.map((f) => hexKey(f.hex)),
  ]);
  const out: SvgNode[] = [];
  for (const [key, tile] of Object.entries(s.tiles)) {
    if (!tile.explored || taken.has(key) || s.features[key]) continue;
    const state = cellStateAt(s, key);
    if (state !== 'seen' && state !== 'fading') continue;
    const [q, r] = key.split(',').map(Number) as [number, number];
    out.push(drawExploredEmpty(i.projection, i.palette, { q, r }));
  }
  return out;
}

/**
 * Pursuers led away (a mislead, while `misleadUntilDay` lasts): the misled mark on the creature's back,
 * on the side away from your view's top, for as long as it holds.
 */
export function misledMark(i: OverlayInput): SvgNode[] {
  const until = i.state.misleadUntilDay;
  if (until === null || i.state.day > until) return [];
  const p = i.projection;
  const c = hexCenter(p, i.state.creature.centre.q, i.state.creature.centre.r);
  const size = atLeast(i, 0.5 * p.size, 22);
  const node = drawMisledMark(i.palette, size);
  return [
    el('g', { 'data-mark': 'misled' }, [
      {
        ...node,
        attrs: {
          ...node.attrs,
          x: c.x - 1.1 * p.size - size / 2,
          y: c.y - 1.5 * p.size - size / 2,
        },
      },
    ]),
  ];
}

/** The art kit's soft ring over the hexes each guardian on a hex escorts. */
function escortRings(i: OverlayInput): SvgNode[] {
  return escortCentres(i.state).map((g) => drawEscortRing(i.projection, g, i.palette));
}

export function buildOverlays(i: OverlayInput): Overlays {
  const under: SvgNode[] = [];
  const over: SvgNode[] = [];
  const me = i.state.characters.find((c) => c.id === i.characterId);
  under.push(windowEdge(i));
  under.push(...creatureHints(i));
  const grace = graceHexes(i);
  under.push(...graceTiles(i, grace));
  under.push(...escortRings(i));
  under.push(...exploredEmpty(i));
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
    under.push(
      placeOutline(
        i,
        i.flow.to,
        accentRamp(i.palette, accentOf(i.characterId, MAP_TUNING.accent)).shade,
        2.6,
      ),
    );
    over.push(...pathArrow(i, feet, i.flow.steps));
  }
  if (i.flow.kind === 'threat') over.push(...threatTrail(i, i.flow.id));
  over.push(...lostCharacters(i));
  if (staysPut(i.predicted)) over.push(stayHint(i));
  over.push(...actionHints(i));
  over.push(...misledMark(i));
  const standing = me?.status === 'active' && me.at.kind === 'hex' ? me.at.hex : null;
  if (feet && standing && grace.some((h) => h.q === standing.q && h.r === standing.r)) {
    over.push(graceWarning(i, feet));
  }
  return { under, over };
}
