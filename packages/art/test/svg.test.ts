import { describe, expect, it } from 'vitest';
import { ALLOWED_TAGS, countNodes, el, isAllowedAttr, toSvgString } from '../src/svg.ts';
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

  it('rejects tags outside the allowlist', () => {
    for (const tag of [
      'script',
      'foreignObject',
      'image',
      'use',
      'a',
      'text',
      'style',
      'script x',
    ]) {
      expect(() => toSvgString(el('svg', {}, [el(tag)])), tag).toThrow(/not allowed/);
    }
    for (const tag of ALLOWED_TAGS) expect(() => toSvgString(el(tag))).not.toThrow();
  });

  it('rejects event handlers, links, inline styles and malformed attribute names', () => {
    for (const name of [
      'onload',
      'onClick',
      'ONMOUSEOVER',
      'href',
      'xlink:href',
      'style',
      'Style',
      'on load',
      '1x',
    ]) {
      expect(() => toSvgString(el('g', { [name]: 'x' })), name).toThrow(/not allowed/);
      expect(isAllowedAttr(name), name).toBe(false);
    }
    expect(isAllowedAttr('stroke-width')).toBe(true);
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
