import { describe, expect, it } from 'vitest';
import { drawCreature, GENTLE_AMBLER } from '../src/creature.ts';
import { drawIcon } from '../src/icons.ts';
import { drawMoment } from '../src/marks.ts';
import { paletteColours, SPRING } from '../src/palette.ts';
import { isometric } from '../src/projection.ts';
import { renderScene } from '../src/scene.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { drawPackIcon, drawStoresIcon, drawUnlockSeal, drawWorkBar } from '../src/team-marks.ts';
import { drawVeilLift } from '../src/tile.ts';

const allowed = paletteColours(SPRING);
const within = (node: SvgNode): void => {
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url('))
        expect(allowed.has(v.toLowerCase()), v).toBe(true);
    }
  });
  expect(toSvgString(node)).not.toMatch(/NaN|undefined/);
};

describe('the unexplored veil', () => {
  const cells = Array.from({ length: 12 }, (_, i) => ({
    q: i,
    r: -Math.floor(i / 2),
    terrain: 'forest',
    state: 'unexplored' as const,
  }));

  it('covers many hexes with one path on one shared pattern, also in lite mode', () => {
    for (const effects of ['full', 'lite'] as const) {
      const svg = renderScene({
        cells,
        projection: isometric(),
        palette: SPRING,
        seed: 'v',
        effects,
      });
      let veils = 0;
      walk(svg, (n) => {
        if (n.attrs['data-veil'] === 'all') veils += 1;
      });
      expect(veils).toBe(1);
      expect(toSvgString(svg)).toMatch(/<pattern id="br-veil"/);
    }
  });

  it('draws a single hex veil for the map to lift, tagged with its hex', () => {
    const lift = drawVeilLift(isometric(), { q: 2, r: -1 });
    expect(lift.attrs['data-veil']).toBe('2,-1');
    expect(lift.attrs.fill).toBe('url(#br-veil)');
  });
});

describe('team marks', () => {
  const filledPips = (svg: SvgNode): number => {
    let n = 0;
    walk(svg, (x) => {
      if (x.attrs.fill === SPRING.accents.ochre.base && String(x.attrs.d).includes('A')) n += 1;
    });
    return n;
  };

  it('fills one pip per unit in a pack, clamped to its capacity', () => {
    expect(filledPips(drawPackIcon(SPRING, 48, 0))).toBe(0);
    expect(filledPips(drawPackIcon(SPRING, 48, 4))).toBe(4);
    expect(filledPips(drawPackIcon(SPRING, 48, 99))).toBe(6);
    expect(filledPips(drawPackIcon(SPRING, 48, Number.NaN))).toBe(0);
    for (let n = 0; n <= 6; n += 1) within(drawPackIcon(SPRING, 48, n));
  });

  it('draws the work bar filled to its fraction, clamped, with ticks between steps', () => {
    within(drawWorkBar(SPRING, 120, 0.5, 4));
    expect(toSvgString(drawWorkBar(SPRING, 120, 2))).toBe(toSvgString(drawWorkBar(SPRING, 120, 1)));
    expect(toSvgString(drawWorkBar(SPRING, 120, -1))).toBe(
      toSvgString(drawWorkBar(SPRING, 120, 0)),
    );
  });

  it('seals an unlock icon when done, and draws the stores and a lone seal', () => {
    expect(toSvgString(drawIcon('hook', SPRING, 48, { done: true }))).not.toBe(
      toSvgString(drawIcon('hook', SPRING, 48)),
    );
    within(drawIcon('lantern', SPRING, 48, { done: true }));
    within(drawStoresIcon(SPRING, 48));
    within(drawUnlockSeal(SPRING, 24));
  });

  it('draws the survey moment in three staged parts', () => {
    expect(drawMoment('survey', SPRING, 64).children.map((n) => n.attrs['data-part'])).toEqual([
      '0',
      '1',
      '2',
    ]);
  });

  it('puts crates on the creature only when the stores hold something', () => {
    const draw = (stores: number) =>
      toSvgString(
        el(
          'g',
          {},
          drawCreature(SPRING, GENTLE_AMBLER, { x: 0, y: 0 }, 64, 0.8, 1.4, { q: 0, r: -1 }, stores)
            .nodes,
        ),
      );
    expect(draw(0)).not.toContain(SPRING.ramps.bark.light);
    expect(draw(6)).toContain(SPRING.ramps.bark.light);
  });
});
