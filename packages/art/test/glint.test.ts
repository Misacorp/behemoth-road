import { describe, expect, it } from 'vitest';
import { paletteColours, SPRING } from '../src/palette.ts';
import { hintMark } from '../src/props.ts';
import { rngFor } from '../src/rng.ts';
import { isAllowedAttr, walk, type SvgNode } from '../src/svg.ts';

const ctx = {
  palette: SPRING,
  rng: rngFor('g'),
  origin: { x: 0, y: 0 },
  k: 0.5,
  squash: 0.8,
  ink: 1,
  rise: 0.875,
};

describe('the glint', () => {
  const drawn = hintMark(ctx);
  const root: SvgNode = { tag: 'g', attrs: {}, children: drawn.nodes };
  const parts: string[] = [];
  walk(root, (n) => {
    const g = n.attrs['data-glint'];
    if (typeof g === 'string') parts.push(g);
  });

  it('has a ring, a glow, a star and sparkles, each tagged for the map to animate', () => {
    expect([...parts].sort()).toEqual(['halo', 'ring', 'specks', 'star']);
  });

  it('stays within the hex (a circumradius of 64 * k) sideways and just above it', () => {
    const r = 64 * ctx.k;
    expect(drawn.box.x0).toBeGreaterThanOrEqual(-r);
    expect(drawn.box.x1).toBeLessThanOrEqual(r);
    expect(drawn.box.y0).toBeGreaterThanOrEqual(-r * 1.2);
    expect(drawn.box.y1).toBeLessThanOrEqual(r);
  });

  it('is clearly bigger than the old twinkle (star radius 7.5)', () => {
    expect(drawn.box.y1 - drawn.box.y0).toBeGreaterThan(40 * ctx.k);
  });

  it('uses palette colours and allowed attributes only, no style attribute', () => {
    const ok = paletteColours(SPRING);
    walk(root, (n) => {
      for (const name of Object.keys(n.attrs)) {
        expect(isAllowedAttr(name), name).toBe(true);
        expect(name).not.toBe('style');
      }
      for (const f of ['fill', 'stroke']) {
        const v = n.attrs[f];
        if (typeof v === 'string' && v !== 'none') expect(ok).toContain(v.toLowerCase());
      }
    });
  });
});
