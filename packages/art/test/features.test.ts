import { describe, expect, it } from 'vitest';
import { FEATURE_DRAWERS, featureDrawer, type FeatureState } from '../src/features.ts';
import { drawIcon, hasIcon, ITEM_MOTIFS, MATERIAL_MOTIFS } from '../src/icons.ts';
import { drawMoment, drawViaMark, MOMENT_KINDS } from '../src/marks.ts';
import { paletteColours, SPRING } from '../src/palette.ts';
import { isometric } from '../src/projection.ts';
import { rngFor } from '../src/rng.ts';
import { renderScene } from '../src/scene.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';

const allowed = paletteColours(SPRING);
const colours = (node: SvgNode): string[] => {
  const out: string[] = [];
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none') out.push(v.toLowerCase());
    }
  });
  return out;
};
const ctx = {
  palette: SPRING,
  rng: rngFor('t'),
  origin: { x: 0, y: 0 },
  k: 1,
  squash: 0.8,
  ink: 1.4,
  rise: 0.875,
};
const draw = (look: string, state: FeatureState): string =>
  toSvgString(el('g', {}, featureDrawer(look)(ctx, state).nodes));

describe('features', () => {
  it('draws every look, and the used-up state differs from the found one', () => {
    for (const look of Object.keys(FEATURE_DRAWERS)) {
      const ready = draw(look, 'ready');
      expect(ready, look).not.toMatch(/NaN|undefined/);
      for (const c of colours(el('g', {}, featureDrawer(look)(ctx, 'ready').nodes)))
        expect(allowed.has(c), `${look} ${c}`).toBe(true);
    }
    for (const look of ['ore', 'stones', 'logs'])
      expect(draw(look, 'depleted')).not.toBe(draw(look, 'ready'));
    for (const look of ['tomb', 'deep-tomb'])
      expect(draw(look, 'spent')).not.toBe(draw(look, 'ready'));
  });

  it('draws a neutral cairn for an unknown look', () => {
    expect(draw('no-such-feature', 'ready')).toBe(draw('constructor', 'ready'));
    expect(draw('no-such-feature', 'ready')).not.toBe(draw('tomb', 'ready'));
  });

  it('replaces the terrain props on its tile in a scene', () => {
    const base = { projection: isometric(), palette: SPRING, seed: 'f' } as const;
    const plain = toSvgString(renderScene({ ...base, cells: [{ q: 0, r: 0, terrain: 'forest' }] }));
    const withFeature = toSvgString(
      renderScene({
        ...base,
        cells: [{ q: 0, r: 0, terrain: 'forest', feature: { look: 'logs' } }],
      }),
    );
    // Forest props draw foliage; a feature tile draws none of it.
    expect(plain).toContain(SPRING.ramps.foliage.base);
    expect(withFeature).not.toContain(SPRING.ramps.foliage.base);
  });
});

describe('marks', () => {
  it('draws each moment in three staged parts, within the palette', () => {
    for (const kind of MOMENT_KINDS) {
      const svg = drawMoment(kind, SPRING, 96);
      const parts = svg.children.map((n) => n.attrs['data-part']);
      expect(parts, kind).toEqual(['0', '1', '2']);
      for (const c of colours(svg)) expect(allowed.has(c), `${kind} ${c}`).toBe(true);
      expect(toSvgString(svg)).not.toMatch(/NaN|undefined/);
    }
    expect(toSvgString(drawMoment('nope', SPRING, 96))).toBe(
      toSvgString(drawMoment('reveal', SPRING, 96)),
    );
  });

  it('draws the hook on a grappling-hook step and a plain dot otherwise', () => {
    expect(toSvgString(drawViaMark('grappling-hook', SPRING, 24))).not.toBe(
      toSvgString(drawViaMark('rope', SPRING, 24)),
    );
    expect(drawViaMark('rope', SPRING, 24).children).toHaveLength(1);
  });
});

describe('material and item icons', () => {
  it('draws each on its own tile within the palette', () => {
    for (const key of [...Object.keys(MATERIAL_MOTIFS), ...Object.keys(ITEM_MOTIFS)]) {
      expect(hasIcon(key), key).toBe(true);
      const svg = drawIcon(key, SPRING, 48);
      for (const c of colours(svg)) expect(allowed.has(c), `${key} ${c}`).toBe(true);
      expect(toSvgString(svg)).not.toMatch(/NaN|undefined/);
    }
  });
});
