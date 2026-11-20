/**
 * The art kit set-up the map draws with: one projection and one palette, chosen in `MAP_TUNING`, and the
 * one place the web client picks which art kit drawing each interface mark and moment uses.
 *
 * Placeholders: the out-of-reach arrow, the explored-empty mark, the role badge on a greyed action, the
 * misled mark and the moments for an empty survey, a mislead and relieved peril are drawn here from art
 * kit parts until the art kit has its own; swapping each in is an edit to this file only.
 */
import {
  drawIcon,
  drawMoment,
  el,
  hexCenter,
  isometric,
  paletteById,
  type Palette,
  type Projection,
  type SvgNode,
} from '@behemoth-road/art';
import { MAP_TUNING } from './config.ts';

export const PROJECTION = isometric(MAP_TUNING.hexSize, MAP_TUNING.tilt);
export const PALETTE = paletteById(MAP_TUNING.paletteId);

/** The art kit's moment each map moment plays (`MOMENT_KINDS` and `SEASON_MOMENT_KINDS`). */
const MOMENT_ART: Readonly<Record<string, string>> = {
  threat: 'threat-appears',
  strike: 'creature-struck',
  struck: 'character-struck',
  hit: 'threat-hit',
  cleared: 'threat-cleared',
  defend: 'defence-holds',
  befriended: 'befriended',
  angered: 'angered',
  boon: 'boon',
  'season-over': 'season-end',
  // Placeholders until the art kit draws its own.
  'nothing-here': 'survey',
  misled: 'threat-cleared',
  relieved: 'defence-holds',
};

/** A map moment's mark (Milestone 5 and the polish round's). */
export const drawM5Moment = (kind: string, palette: Palette, size: number): SvgNode =>
  drawMoment(MOMENT_ART[kind] ?? kind, palette, size);

const n = (v: number): string => (Math.round(v * 10) / 10).toString();

/**
 * Out of reach: a faded dashed arrow from your feet toward the tapped hex, ending in a cross instead of a
 * head (world px). Placeholder for the art kit's arrow-with-cross mark.
 */
export function drawOutOfReach(
  palette: Palette,
  from: { x: number; y: number },
  to: { x: number; y: number },
  k: number,
): SvgNode {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Stop short of the hex centre so the cross sits on the tile, not past it.
  const end = { x: to.x - ux * 6 * k, y: to.y - uy * 6 * k };
  const start = { x: from.x + ux * 10 * k, y: from.y + uy * 10 * k };
  const c = 7 * k;
  const line = {
    fill: 'none',
    stroke: palette.ink,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  } as const;
  return el('g', { 'data-mark': 'out-of-reach', opacity: 0.55 }, [
    el('path', {
      d: `M${n(start.x)} ${n(start.y)}L${n(end.x)} ${n(end.y)}`,
      ...line,
      'stroke-width': 2.4 * k,
      'stroke-dasharray': `${n(7 * k)} ${n(6 * k)}`,
    }),
    el('path', {
      d: `M${n(end.x - c)} ${n(end.y - c)}L${n(end.x + c)} ${n(end.y + c)}M${n(end.x + c)} ${n(end.y - c)}L${n(end.x - c)} ${n(end.y + c)}`,
      ...line,
      stroke: palette.hint,
      'stroke-width': 3.2 * k,
    }),
  ]);
}

/**
 * An explored hex where nothing was found: a small, faint hollow ring on the ground (world px).
 * Placeholder for the art kit's explored-empty mark.
 */
export function drawExploredEmpty(
  p: Projection,
  palette: Palette,
  h: { q: number; r: number },
): SvgNode {
  const c = hexCenter(p, h.q, h.r);
  const rx = 0.16 * p.size;
  const ry = rx * p.squash;
  return el('path', {
    'data-mark': 'explored-empty',
    d: `M${n(c.x - rx)} ${n(c.y)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`,
    fill: 'none',
    stroke: palette.inkSoft,
    'stroke-width': 1.4 * p.k,
    'stroke-dasharray': `${n(2 * p.k)} ${n(3 * p.k)}`,
    opacity: 0.8,
  });
}

/**
 * The role a greyed action needs, as a badge: the role's emblem on a paper disc (a 24 × 24 `<svg>`).
 * Placeholder for the art kit's role emblem badge.
 */
export function drawRoleBadge(role: string, palette: Palette, size: number): SvgNode {
  const icon = drawIcon(`role:${role}`, palette, 18);
  return el('svg', { viewBox: '-12 -12 24 24', width: size, height: size }, [
    el('circle', { r: 11, fill: palette.paper, stroke: palette.ink, 'stroke-width': 1.4 }),
    { ...icon, attrs: { ...icon.attrs, x: -9, y: -9, width: 18, height: 18 } },
  ]);
}

/**
 * Pursuers are led away for a while (a mislead): a curved arrow turning back on itself (a 24 × 24
 * `<svg>`). Placeholder for the art kit's misled state mark.
 */
export function drawMisledMark(palette: Palette, size: number): SvgNode {
  return el('svg', { viewBox: '-12 -12 24 24', width: size, height: size }, [
    el('circle', { r: 11, fill: palette.paper, stroke: palette.inkSoft, 'stroke-width': 1.2 }),
    el('path', {
      d: 'M-6 5C-6 -4 6 -6 6 1',
      fill: 'none',
      stroke: palette.ink,
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-dasharray': '3 2.2',
    }),
    el('path', {
      d: 'M2.5 -1.5L6 1L8.5 -2.4',
      fill: 'none',
      stroke: palette.ink,
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ]);
}
