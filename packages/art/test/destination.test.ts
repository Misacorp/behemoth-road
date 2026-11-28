import { describe, expect, it } from 'vitest';
import { drawDestinationBadge, drawDestinationGlow } from '../src/destination.ts';
import { MORNING, SPRING } from '../src/palette.ts';
import { isometric } from '../src/projection.ts';
import { toSvgString, walk, type SvgNode } from '../src/svg.ts';

const p = isometric(40);
const count = (node: SvgNode, attr: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs[attr] !== undefined) n += 1;
  });
  return n;
};

describe('the destination glow', () => {
  const hexes = [
    { q: 0, r: 0 },
    { q: 1, r: -1 },
    { q: 2, r: -1 },
  ];

  it('lights every hex of the area, once each, and nothing else', () => {
    const g = drawDestinationGlow(SPRING, p, hexes);
    expect(g.attrs['data-destination-glow']).toBe(3);
    expect(count(g, 'data-destination')).toBe(3);
    // Ground light, a rising column and motes on each hex.
    expect(count(g, 'data-glow')).toBeGreaterThanOrEqual(9);
  });

  it('draws nothing for no hexes, and never blocks a tap', () => {
    const g = drawDestinationGlow(SPRING, p, []);
    expect(count(g, 'data-destination')).toBe(0);
    expect(g.attrs['pointer-events']).toBe('none');
  });

  it('is warm: gold and green from the palette, never the ink', () => {
    for (const pal of [SPRING, MORNING]) {
      const text = toSvgString(drawDestinationGlow(pal, p, hexes));
      expect(text).toContain(pal.accents.ochre.light);
      expect(text).toContain(pal.accents.sage.base);
      expect(text).not.toContain(pal.ink);
    }
  });

  it('is deterministic and keeps its gradients apart by prefix', () => {
    expect(toSvgString(drawDestinationGlow(SPRING, p, hexes))).toBe(
      toSvgString(drawDestinationGlow(SPRING, p, hexes)),
    );
    expect(toSvgString(drawDestinationGlow(SPRING, p, hexes, 'other'))).toContain('other-ground');
  });

  it('has a badge for the route strip in the same light', () => {
    const b = drawDestinationBadge(SPRING, 20);
    expect(b.attrs.width).toBe(20);
    expect(toSvgString(b)).toContain(SPRING.accents.ochre.light);
    expect(count(b, 'data-glow')).toBe(1);
  });
});
