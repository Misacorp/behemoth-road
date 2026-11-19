/** A character as a small upright ink standee: explorer's hat, cloak in the character's accent colour. */
import { ART_TUNING } from './config.ts';
import { boxOf, ellipsePath, mapper, poly, smoothClosed, type Point } from './geom.ts';
import { accentRamp, type Palette } from './palette.ts';
import { inkAttrs, inkWidth, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export interface CharacterArt {
  readonly id: string;
  readonly q: number;
  readonly r: number;
  /** An accent key from the palette (`ACCENTS`); unknown keys fall back to the first accent. */
  readonly accent: string;
}

const HEIGHT_UNITS = 50;

export function drawCharacter(
  palette: Palette,
  accent: string,
  origin: Point,
  size: number,
  squash: number,
): Drawn {
  const k = (size * ART_TUNING.characterHeight) / HEIGHT_UNITS;
  const scale = size / ART_TUNING.hexSize;
  const T = mapper(origin, k);
  const ramp = accentRamp(palette, accent);
  const w = inkWidth(scale) * 0.95;
  const pts = (raw: readonly (readonly [number, number])[]): Point[] =>
    raw.map(([x, y]) => T(x, y));
  const inkLine = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const sq = squash / 0.6;

  const base = ellipsePath(origin.x, origin.y, 10 * k, 3.2 * k * sq);
  const pack = pts([
    [-12.5, -28],
    [-6, -29],
    [-5, -13],
    [-12, -12.5],
  ]);
  const cloak = pts([
    [0, -33],
    [7, -29.5],
    [9, -16],
    [11, -5],
    [4, -3],
    [-4, -3],
    [-11, -5],
    [-9, -16],
    [-7, -29.5],
  ]);
  const cloakShade = pts([
    [1.5, -32],
    [7, -29.5],
    [9, -16],
    [11, -5],
    [4, -3],
    [2.5, -16],
  ]);
  const staff = pts([
    [12.5, -1],
    [14, -42],
  ]);
  const head = T(0, -38.5);
  const hand = T(12.8, -20);
  const brim = T(0, -43);
  const crown = pts([
    [-5.5, -43],
    [-4.8, -48],
    [-1, -50],
    [3.5, -49],
    [5.5, -43],
  ]);
  const eyes = [T(-2.4, -38.5), T(2.4, -38.5)];
  const feet = [T(-3.6, -2.2), T(3.6, -2.2)];

  return {
    nodes: [
      fill(
        ellipsePath(origin.x + 2 * k, origin.y + 0.6 * k, 13 * k, 4 * k * sq),
        palette.shadow,
        0.18,
      ),
      fill(base, palette.paperDeep),
      inkLine(base, w * 0.8),
      fill(poly(pack), palette.ramps.bark.base),
      inkLine(poly(pack), w * 0.8),
      fill(
        feet.map((p) => ellipsePath(p.x, p.y, 2.4 * k, 1.5 * k)).join(''),
        palette.ramps.bark.shade,
      ),
      fill(smoothClosed(cloak), ramp.base),
      fill(smoothClosed(cloakShade), ramp.shade, 0.6),
      inkLine(smoothClosed(cloak)),
      inkLine(poly(staff, false), w * 1.3, palette.ramps.bark.shade),
      fill(ellipsePath(hand.x, hand.y, 2.2 * k, 2.2 * k), palette.skin),
      inkLine(ellipsePath(hand.x, hand.y, 2.2 * k, 2.2 * k), w * 0.7),
      fill(ellipsePath(head.x, head.y, 7 * k, 7 * k), palette.skin),
      inkLine(ellipsePath(head.x, head.y, 7 * k, 7 * k)),
      fill(eyes.map((p) => ellipsePath(p.x, p.y, 0.85 * k, 0.95 * k)).join(''), palette.ink),
      fill(smoothClosed(crown), palette.ramps.bark.base),
      fill(ellipsePath(brim.x, brim.y, 10.5 * k, 2.6 * k), palette.ramps.bark.base),
      inkLine(smoothClosed(crown) + ellipsePath(brim.x, brim.y, 10.5 * k, 2.6 * k), w * 0.9),
    ],
    box: boxOf([...cloak, ...crown, ...staff, ...pack, T(-10.5, -43), T(10.5, 0)]),
  };
}
