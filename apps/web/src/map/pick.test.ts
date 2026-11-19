import { hexCenter, isometric, topDown } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { pickHex, roundHex, worldToHex } from './pick.ts';

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

  it('rounds to the nearest hex without -0', () => {
    expect(roundHex(-0.1, 0.05)).toEqual({ q: 0, r: 0 });
    expect(Object.is(roundHex(-0.1, 0.05).q, -0)).toBe(false);
    expect(roundHex(0.6, 0.1)).toEqual({ q: 1, r: 0 });
  });

  it("picks the character's hex when its upright figure is tapped", () => {
    const p = isometric(64);
    const me = { q: 2, r: -1 };
    const c = hexCenter(p, me.q, me.r);
    // The head is drawn over the hex behind (north of) the character.
    const head = { x: c.x - 0.05 * p.size, y: c.y + 0.3 * p.size * p.squash - 0.7 * p.size };
    expect(worldToHex(p, head)).not.toEqual(me);
    expect(pickHex(p, head, me)).toEqual(me);
    expect(pickHex(p, head, null)).toEqual(worldToHex(p, head));
  });
});
