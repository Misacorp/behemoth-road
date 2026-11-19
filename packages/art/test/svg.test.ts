import { describe, expect, it } from 'vitest';
import { el, toSvgString, countNodes } from '../src/svg.ts';
import { f } from '../src/geom.ts';
import { rngFor } from '../src/rng.ts';

describe('svg tree', () => {
  it('serialises with escaped attributes and the SVG namespace', () => {
    const svg = el('svg', { width: 10 }, [el('path', { d: 'M0 0', 'data-x': '"<&>' })]);
    expect(toSvgString(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10"><path d="M0 0" data-x="&quot;&lt;&amp;&gt;"/></svg>',
    );
    expect(countNodes(svg)).toBe(2);
  });

  it('rejects bad tag and attribute names', () => {
    expect(() => toSvgString(el('script x', {}))).toThrow();
    expect(() => toSvgString(el('g', { 'on load': 'x' }))).toThrow();
  });
});

describe('helpers', () => {
  it('formats numbers without -0 and refuses NaN', () => {
    expect(f(-0.01)).toBe('0');
    expect(f(1.26)).toBe('1.3');
    expect(() => f(Number.NaN)).toThrow();
  });

  it('seeded generators repeat for the same keys and differ for others', () => {
    const a = rngFor('seed', 1, 2);
    const b = rngFor('seed', 1, 2);
    const c = rngFor('seed', 2, 1);
    const seq = (r: typeof a) => [r.next(), r.next(), r.next()];
    expect(seq(a)).toEqual(seq(b));
    expect(seq(rngFor('seed', 1, 2))).not.toEqual(seq(c));
  });
});
