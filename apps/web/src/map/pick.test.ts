import { figureAnchor, hexCenter, isometric, topDown } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { feetOf, pickHex, worldToHex } from './pick.ts';

const hexes = (): { q: number; r: number }[] => {
  const out = [];
  for (let q = -6; q <= 6; q += 1) for (let r = -6; r <= 6; r += 1) out.push({ q, r });
  return out;
};

describe('screen-to-hex picking', () => {
  for (const p of [isometric(64), isometric(30, 0.5), topDown(64)]) {
    it(`round-trips every hex centre (${p.kind}, squash ${p.squash})`, () => {
      for (const h of hexes()) expect(worldToHex(p, hexCenter(p, h.q, h.r))).toEqual(h);
    });

    it(`finds the hex for points inside its top face (${p.kind})`, () => {
      for (const h of hexes()) {
        const c = hexCenter(p, h.q, h.r);
        // 0.8 of the inner radius in six directions stays inside the hex.
        const inner = (p.size * Math.sqrt(3)) / 2;
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          const pt = {
            x: c.x + Math.cos(a) * inner * 0.8,
            y: c.y + Math.sin(a) * inner * 0.8 * p.squash,
          };
          expect(worldToHex(p, pt)).toEqual(h);
        }
      }
    });
  }

  it("picks the character's hex when its upright figure is tapped", () => {
    // At a low view (0.6) the head reaches over the hex behind; at the map's 0.8 it mostly stays on its own.
    const p = isometric(64, 0.6);
    const me = { q: 2, r: -1 };
    const c = hexCenter(p, me.q, me.r);
    // The head is drawn over the hex behind (north of) the character.
    const feet = feetOf(p, me);
    expect(worldToHex(p, feet)).toEqual(me);
    expect(feet.y).toBeGreaterThan(c.y);
    const head = { x: feet.x, y: feet.y - 0.7 * p.size };
    expect(worldToHex(p, head)).not.toEqual(me);
    expect(pickHex(p, head, me)).toEqual(me);
    expect(pickHex(p, head, null)).toEqual(worldToHex(p, head));
  });

  it('picks the character at the map tilt (0.8), also when it stands on the creature', () => {
    const p = isometric(64, 0.8);
    for (const me of [
      { q: 2, r: -1 },
      { q: 1, r: 0 }, // a creature footprint hex when the creature is at 0,0
    ]) {
      const feet = feetOf(p, me);
      expect(feet).toEqual(figureAnchor(p, me));
      expect(worldToHex(p, feet)).toEqual(me);
      const head = { x: feet.x, y: feet.y - 0.6 * p.size };
      expect(pickHex(p, head, me)).toEqual(me);
      // Far above the figure, the tap goes to the hex under the point.
      const above = { x: feet.x, y: feet.y - 1.6 * p.size };
      expect(pickHex(p, above, me)).toEqual(worldToHex(p, above));
    }
  });

  it('places feet like the art kit beside a site and for a second figure on a tile', () => {
    const p = isometric(64, 0.8);
    const h = { q: 0, r: 0 };
    expect(feetOf(p, h, 0, { site: true })).toEqual(figureAnchor(p, h, 0, { site: true }));
    expect(feetOf(p, h, 1).x).toBeGreaterThan(feetOf(p, h, 0).x);
  });
});
