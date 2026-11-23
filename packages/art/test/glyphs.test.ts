import { describe, expect, it } from 'vitest';
import { drawCharacterMarks } from '../src/escort.ts';
import { drawGlyph, GLYPH_NAMES, glyphNodes, isGlyph } from '../src/glyphs.ts';
import { paletteColours, SPRING } from '../src/palette.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';

const allowed = paletteColours(SPRING);
const within = (node: SvgNode): void => {
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none')
        expect(allowed.has(v.toLowerCase()), `${name}=${v}`).toBe(true);
    }
  });
  expect(toSvgString(node)).not.toMatch(/NaN|undefined|Infinity|<text/);
};
const marks = (node: SvgNode, kind: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs['data-mark'] === kind) n++;
  });
  return n;
};

describe('stance glyphs', () => {
  it('draws every named glyph within the palette, each different', () => {
    const seen = new Set<string>();
    for (const name of GLYPH_NAMES) {
      const drawn = drawGlyph(name, SPRING, 24);
      within(drawn);
      expect(drawn.attrs['data-glyph']).toBe(name);
      seen.add(toSvgString(drawn));
    }
    expect(seen.size).toBe(GLYPH_NAMES.length);
  });

  it('draws nothing for an unknown name', () => {
    expect(isGlyph('nap')).toBe(false);
    expect(glyphNodes('nap', SPRING, 0, 0, 1, 1)).toEqual([]);
  });

  it('puts a stance mark and a waiting mark on a figure only when asked', () => {
    const on = drawCharacterMarks(SPRING, { x: 0, y: 0 }, 64, 0.8, 1.4, {
      stance: 'eye',
      waiting: true,
    });
    const g = el('g', {}, on.nodes);
    within(g);
    expect(marks(g, 'stance')).toBe(1);
    expect(marks(g, 'waiting')).toBe(1);
    const none = drawCharacterMarks(SPRING, { x: 0, y: 0 }, 64, 0.8, 1.4, { stance: 'nap' });
    expect(none.nodes).toHaveLength(0);
  });
});
