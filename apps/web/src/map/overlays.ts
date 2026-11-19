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
  type ReachablePlace,
  creatureHexes,
  placeHex,
} from '@behemoth-road/core';
import { MAP_TUNING } from './config.ts';
import type { Flow } from './flow.ts';
import { feetOf, type Point } from './pick.ts';

export interface OverlayInput {
  readonly state: GameState;
  readonly flow: Flow;
  readonly characterId: string;
  readonly reachable: readonly ReachablePlace[];
  readonly predicted: readonly CreatureStepOption[];
  readonly projection: Projection;
  readonly palette: Palette;
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

/** Reachable tiles: a soft light wash with a faint ink edge, one path for all of them. */
function reachableWash(i: OverlayInput): SvgNode[] {
  if (i.reachable.length === 0) return [];
  const d = i.reachable
    .flatMap((r) => (r.place.kind === 'hex' ? [r.place.hex] : creatureHexes(i.state)))
    .map((h) => hexPath(i.projection, h, 0.86))
    .join('');
  return [
    el('path', { d, fill: i.palette.paper, opacity: 0.42 }),
    el('path', {
      d,
      fill: 'none',
      stroke: i.palette.inkSoft,
      'stroke-width': 1.2 * i.projection.k,
      'stroke-dasharray': `${n(3 * i.projection.k)} ${n(4 * i.projection.k)}`,
      opacity: 0.8,
    }),
  ];
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

/** A ring at the selected character's feet. */
function selectionRing(i: OverlayInput, at: Hex): SvgNode {
  const p = i.projection;
  const ramp = accentRamp(i.palette, MAP_TUNING.accent);
  return el('path', {
    d: ellipse(feetOf(p, at), 0.3 * p.size, 0.3 * p.size * p.squash),
    fill: ramp.light,
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
function pathArrow(i: OverlayInput, from: Hex, steps: readonly PathStep[]): SvgNode[] {
  const p = i.projection;
  const k = p.k;
  const pts = [feetOf(p, from), ...steps.map((s) => feetOf(p, placeHex(i.state, s.place)))];
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

export function buildOverlays(i: OverlayInput): Overlays {
  const under: SvgNode[] = [];
  const over: SvgNode[] = [];
  const me = i.state.characters.find((c) => c.id === i.characterId);
  under.push(...creatureHints(i));
  if (i.flow.kind === 'selected' || i.flow.kind === 'planned') {
    under.push(...reachableWash(i));
    if (me?.status === 'active') under.push(selectionRing(i, placeHex(i.state, me.at)));
  }
  if (i.flow.kind === 'inspect') under.push(hexOutline(i, i.flow.hex, i.palette.ink, 2.2));
  if (i.flow.kind === 'planned' && me) {
    under.push(hexOutline(i, i.flow.to, accentRamp(i.palette, MAP_TUNING.accent).shade, 2.6));
    over.push(...pathArrow(i, placeHex(i.state, me.at), i.flow.steps));
  }
  over.push(...lostCharacters(i));
  return { under, over };
}
