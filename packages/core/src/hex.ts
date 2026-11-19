/**
 * Hex maths on axial coordinates, flat-top orientation.
 *
 * Flat-top hexes have neighbours straight north and south, plus north-east,
 * south-east, south-west and north-west. The core knows only coordinates;
 * turning them into screen positions is the renderer's job.
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** The six directions, clockwise from north. */
export const DIRECTIONS = ['n', 'ne', 'se', 's', 'sw', 'nw'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const OFFSETS: Readonly<Record<Direction, Hex>> = {
  n: { q: 0, r: -1 },
  ne: { q: 1, r: -1 },
  se: { q: 1, r: 0 },
  s: { q: 0, r: 1 },
  sw: { q: -1, r: 1 },
  nw: { q: -1, r: 0 },
};

export const hex = (q: number, r: number): Hex => ({ q, r });

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

/** A stable string key, for use in records and sets. */
export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export const directionOffset = (d: Direction): Hex => OFFSETS[d];

/** Rotates a direction by `steps` sixths of a turn; positive is clockwise. */
export const rotate = (d: Direction, steps: number): Direction => {
  const i = DIRECTIONS.indexOf(d);
  return DIRECTIONS[(((i + steps) % 6) + 6) % 6] as Direction;
};

export const neighbour = (h: Hex, d: Direction): Hex => hexAdd(h, OFFSETS[d]);

export const neighbours = (h: Hex): Hex[] => DIRECTIONS.map((d) => neighbour(h, d));

export const hexDistance = (a: Hex, b: Hex): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export const isAdjacent = (a: Hex, b: Hex): boolean => hexDistance(a, b) === 1;

/** Every hex within `radius` of `centre`, centre included: 1 + 3r(r+1) hexes. */
export const hexesInRange = (centre: Hex, radius: number): Hex[] => {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: centre.q + dq, r: centre.r + dr });
  }
  return out;
};

/** The hexes exactly `radius` away from `centre`: 6r hexes (the centre alone for 0). */
export const hexRing = (centre: Hex, radius: number): Hex[] => {
  if (radius === 0) return [centre];
  const out: Hex[] = [];
  let h: Hex = { q: centre.q + OFFSETS.sw.q * radius, r: centre.r + OFFSETS.sw.r * radius };
  // Walk the six sides, starting south-west and heading north first.
  for (const d of DIRECTIONS) {
    for (let i = 0; i < radius; i++) {
      out.push(h);
      h = neighbour(h, d);
    }
  }
  return out;
};
