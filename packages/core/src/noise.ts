/**
 * Seeded value noise over hex coordinates: smooth, low-frequency fields in [0, 1)
 * that are a pure function of (seed, stream, hex). Terrain generation reads them
 * so that terrain forms regions and ribbons instead of speckles.
 */

import type { Hex } from './hex.ts';
import { hashToUnit, type Seed } from './random.ts';

export interface NoiseField {
  /** Size of one noise cell, in hex widths. Larger means bigger features. */
  readonly scale: number;
  /** Layers of finer detail added on top (1 = smooth blobs only). */
  readonly octaves: number;
}

const SQRT3 = Math.sqrt(3);

/**
 * Each octave is turned by 0.83 radians more than the last, so the lattice never
 * shows as straight lines. cos(0.83) and sin(0.83) are written out because
 * ECMAScript does not promise bit-identical trigonometry across engines, and
 * terrain must match exactly on the server, the client and in simulations.
 */
const COS = 0.6748757600712672;
const SIN = 0.7379313711099627;

/** Quintic fade: smooth at the lattice points, so fields have no visible grid. */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const valueNoise2d = (seed: Seed, stream: number, x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const v = (dx: number, dy: number) => hashToUnit(seed, stream, ix + dx, iy + dy);
  return lerp(lerp(v(0, 0), v(1, 0), fx), lerp(v(0, 1), v(1, 1), fx), fy);
};

/**
 * The field's value at a hex, in [0, 1). Hex centres are placed on a plane
 * (flat-top layout, unit hex width) so the field is round, not skewed.
 */
export const noiseAt = (seed: Seed, stream: number, field: NoiseField, h: Hex): number => {
  let x = 1.5 * h.q;
  let y = SQRT3 * (h.r + h.q / 2);
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1 / field.scale;
  [x, y] = [x * COS - y * SIN, x * SIN + y * COS];
  for (let octave = 0; octave < field.octaves; octave++) {
    sum += amplitude * valueNoise2d(seed, stream + octave, x * frequency, y * frequency);
    total += amplitude;
    amplitude /= 2;
    frequency *= 2;
    [x, y] = [x * COS - y * SIN, x * SIN + y * COS];
  }
  return sum / total;
};
