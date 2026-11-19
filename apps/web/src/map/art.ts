/** The art kit set-up the map draws with: one projection and one palette, chosen in `MAP_TUNING`. */
import { isometric, paletteById } from '@behemoth-road/art';
import { MAP_TUNING } from './config.ts';

export const PROJECTION = isometric(MAP_TUNING.hexSize);
export const PALETTE = paletteById(MAP_TUNING.paletteId);
