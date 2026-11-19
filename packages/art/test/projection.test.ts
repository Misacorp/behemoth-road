import { describe, expect, it } from 'vitest';
import {
  hexCenter,
  hexCorners,
  isometric,
  screenToHex,
  topDown,
  type Projection,
} from '../src/projection.ts';
import { facingFor } from '../src/creature.ts';

const projections: [string, Projection][] = [
  ['iso 0.6', isometric(64, 0.6)],
  ['iso 0.5', isometric(64, 0.5)],
  ['top-down', topDown(64)],
  ['iso small', isometric(23, 0.55)],
];

const hexes: { q: number; r: number }[] = [];
for (let q = -12; q <= 12; q += 1) for (let r = -12; r <= 12; r += 1) hexes.push({ q, r });

describe('screenToHex', () => {
  for (const [name, p] of projections) {
    it(`finds each hex from its centre (${name})`, () => {
      for (const h of hexes) {
        const c = hexCenter(p, h.q, h.r);
        expect(screenToHex(p, c.x, c.y)).toEqual(h);
      }
    });

    it(`finds each hex from points just inside its edges and corners (${name})`, () => {
      for (const h of hexes) {
        const c = hexCenter(p, h.q, h.r);
        const corners = hexCorners(p, c);
        for (let i = 0; i < 6; i += 1) {
          const a = corners[i]!;
          const b = corners[(i + 1) % 6]!;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          for (const t of [0.97, 0.995]) {
            for (const target of [a, mid]) {
              const x = c.x + (target.x - c.x) * t;
              const y = c.y + (target.y - c.y) * t;
              expect(screenToHex(p, x, y), `${name} ${h.q},${h.r} edge ${i}`).toEqual(h);
            }
          }
        }
      }
    });
  }

  it('crosses to the neighbour just past an edge', () => {
    const p = isometric();
    const c = hexCenter(p, 0, 0);
    const [a, b] = [hexCorners(p, c)[1]!, hexCorners(p, c)[2]!];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(screenToHex(p, mid.x, mid.y + 0.5)).toEqual({ q: 0, r: 1 });
    expect(screenToHex(p, mid.x, mid.y - 0.5)).toEqual({ q: 0, r: 0 });
  });
});

describe('facingFor', () => {
  it('faces by the east or west part of the heading, and straight north by choice', () => {
    expect(facingFor({ q: 1, r: -1 }, 'away')).toBe('right');
    expect(facingFor({ q: -1, r: 0 }, 'away')).toBe('left');
    expect(facingFor({ q: 0, r: -1 }, 'away')).toBe('away');
    expect(facingFor({ q: 0, r: -1 }, 'side')).toBe('right');
  });
});
