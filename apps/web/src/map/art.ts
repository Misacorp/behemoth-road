/**
 * The art kit set-up the map draws with: one projection and one palette, chosen in `MAP_TUNING`, and the
 * one place the web client picks which art kit drawing each interface mark and moment uses (the
 * out-of-reach mark, the explored-empty mark, the role badge on a greyed action, the misled mark, and the
 * moments).
 */
import {
  drawEmptyMark,
  drawMisledMark as artMisledMark,
  drawMoment,
  drawOutOfReachMark,
  drawRoleBadge as artRoleBadge,
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

/** The art kit's moment each map moment plays (`MOMENT_KINDS`, season and feedback moments). */
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
  'nothing-here': 'nothing-here',
  misled: 'misled',
  relieved: 'peril-relieved',
};

/** A map moment's mark (Milestone 5 and the polish round's). */
export const drawM5Moment = (kind: string, palette: Palette, size: number): SvgNode =>
  drawMoment(MOMENT_ART[kind] ?? kind, palette, size);

/** Where the cross sits in the art kit's out-of-reach mark: this share of its size past its centre. */
const CROSS_AT = 6 / 24;

/**
 * Out of reach: the art kit's arrow ending in a cross, turned to point from your feet toward the tapped
 * hex, with the cross on that hex (world px; `k` scales it with the ink).
 */
export function drawOutOfReach(
  palette: Palette,
  from: { x: number; y: number },
  to: { x: number; y: number },
  k: number,
): SvgNode {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 64 * k;
  const node = drawOutOfReachMark(palette, size, angle);
  const cx = to.x - Math.cos(angle) * CROSS_AT * size;
  const cy = to.y - Math.sin(angle) * CROSS_AT * size;
  return el('g', { 'data-mark': 'out-of-reach' }, [
    { ...node, attrs: { ...node.attrs, x: cx - size / 2, y: cy - size / 2 } },
  ]);
}

/** An explored hex where nothing was found: the art kit's empty mark on the ground (world px). */
export function drawExploredEmpty(
  p: Projection,
  palette: Palette,
  h: { q: number; r: number },
): SvgNode {
  const c = hexCenter(p, h.q, h.r);
  const size = 0.55 * p.size;
  const node = drawEmptyMark(palette, size);
  return el('g', { 'data-mark': 'explored-empty' }, [
    { ...node, attrs: { ...node.attrs, x: c.x - size / 2, y: c.y - size / 2 } },
  ]);
}

/** The role a greyed action needs, as the art kit's badge (an `<svg>` of `size` px). */
export const drawRoleBadge = (role: string, palette: Palette, size: number): SvgNode =>
  artRoleBadge(role, palette, size);

/** Pursuers led away for a while (a mislead): the art kit's misled mark (an `<svg>` of `size` px). */
export const drawMisledMark = (palette: Palette, size: number): SvgNode =>
  artMisledMark(palette, size);
