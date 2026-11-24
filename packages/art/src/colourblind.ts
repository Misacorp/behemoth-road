/**
 * Colour-vision simulation for art checks (Machado, Oliveira and Fernandes 2009, full severity), applied in
 * linear RGB. Used by the palette test and the review sheet; nothing in the game draws with it.
 */
import { rgbUnit } from './palette.ts';

export const VISION = ['protan', 'deutan'] as const;
export type Vision = (typeof VISION)[number];

/** Row-major 3x3 matrices on linear RGB. */
export const VISION_MATRIX: Readonly<Record<Vision, readonly number[]>> = {
  protan: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
};

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** A colour as seen with the given vision, as linear-light 0..1 channels. */
function simulateLinear(hex: string, vision: Vision | 'normal'): [number, number, number] {
  const lin = rgbUnit(hex).map(toLinear) as [number, number, number];
  if (vision === 'normal') return lin;
  const m = VISION_MATRIX[vision];
  return [0, 1, 2].map((i) =>
    clamp(m[i * 3]! * lin[0] + m[i * 3 + 1]! * lin[1] + m[i * 3 + 2]! * lin[2]),
  ) as [number, number, number];
}

/** CIE L*, a*, b* (D65) of a colour as seen with the given vision. */
export function lab(hex: string, vision: Vision | 'normal' = 'normal'): [number, number, number] {
  const [r, g, b] = simulateLinear(hex, vision);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Lightness L* (0..100) of a colour. */
export function lightness(hex: string, vision: Vision | 'normal' = 'normal'): number {
  return lab(hex, vision)[0];
}

/** CIE76 colour difference between two colours as seen with the given vision. */
export function deltaE(a: string, b: string, vision: Vision | 'normal' = 'normal'): number {
  const x = lab(a, vision);
  const y = lab(b, vision);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The simulation as an SVG filter matrix (20 values, row-major 4x5), for review sheets. */
export function visionFilterValues(vision: Vision): string {
  const m = VISION_MATRIX[vision];
  const rows = [0, 1, 2].map((i) => `${m[i * 3]} ${m[i * 3 + 1]} ${m[i * 3 + 2]} 0 0`);
  return `${rows.join(' ')} 0 0 0 1 0`;
}
