/** The art kit set-up the map draws with: one projection and one palette, chosen in `MAP_TUNING`. */
import { drawMoment, isometric, paletteById, type Palette, type SvgNode } from '@behemoth-road/art';
import { MAP_TUNING } from './config.ts';

export const PROJECTION = isometric(MAP_TUNING.hexSize, MAP_TUNING.tilt);
export const PALETTE = paletteById(MAP_TUNING.paletteId);

/**
 * Milestone 5's drawings, in one place: stand-ins until the art kit's own land (`m5/art`), then each line
 * here points at the art kit instead.
 */
export {
  drawApproach,
  drawBandageMark,
  drawEndingScene,
  drawPerilGauge,
  drawRouteStrip,
  drawSettlement,
  drawShieldMark,
  drawThreat,
} from './m5Placeholders.ts';

/** The art kit moment each Milestone 5 moment borrows for now (its own marks come with `m5/art`). */
const M5_MOMENTS: Readonly<Record<string, string>> = {
  threat: 'reveal',
  strike: 'trap',
  struck: 'trap',
  hit: 'trap',
  cleared: 'find',
  defend: 'linger',
  befriended: 'find',
  angered: 'trap',
  boon: 'find',
  'season-over': 'find',
};

/** A Milestone 5 moment's mark. */
export const drawM5Moment = (kind: string, palette: Palette, size: number): SvgNode =>
  drawMoment(M5_MOMENTS[kind] ?? kind, palette, size);
