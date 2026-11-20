/** The art kit set-up the map draws with: one projection and one palette, chosen in `MAP_TUNING`. */
import { drawMoment, isometric, paletteById, type Palette, type SvgNode } from '@behemoth-road/art';
import { MAP_TUNING } from './config.ts';

export const PROJECTION = isometric(MAP_TUNING.hexSize, MAP_TUNING.tilt);
export const PALETTE = paletteById(MAP_TUNING.paletteId);

/** The art kit's season moment each Milestone 5 moment plays (`SEASON_MOMENT_KINDS`). */
const M5_MOMENTS: Readonly<Record<string, string>> = {
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
};

/** A Milestone 5 moment's mark. */
export const drawM5Moment = (kind: string, palette: Palette, size: number): SvgNode =>
  drawMoment(M5_MOMENTS[kind] ?? kind, palette, size);
