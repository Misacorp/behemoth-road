import { describe, expect, it } from 'vitest';
import { drawBlockedHexes } from '../src/blocked.ts';
import { deltaE, lightness, VISION } from '../src/colourblind.ts';
import { ACTION_MOTIFS, drawIcon } from '../src/icons.ts';
import { drawCapybara, drawLeadsLeft, CAPYBARA_STATES, LEADS_MAX } from '../src/lure-art.ts';
import { CART_STATES, drawCargoFill, drawCart } from '../src/cart-art.ts';
import {
  drawBurnableMark,
  drawFearsFireMark,
  drawFireGlow,
  drawPinned,
  FOOTING_NODES,
  jaggedFlame,
  liePinned,
} from '../src/fire-art.ts';
import { drawCharacter } from '../src/character.ts';
import { drawHazardIcon, drawScreeField, HAZARD_ICON_KEYS } from '../src/hazards.ts';
import { drawOddsMark, ODDS_FAILURES } from '../src/odds.ts';
import { PALETTES, paletteColours, SPRING, type Palette } from '../src/palette.ts';
import { isometric, topDown } from '../src/projection.ts';
import { buildReviewItems } from '../src/review.ts';
import { renderScene } from '../src/scene.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { terrainLook } from '../src/terrain.ts';

const COLOUR_ATTRS = ['fill', 'stroke', 'stop-color'];

/** Palette colours only, a serialisable tree, no bad numbers, no text. */
function clean(node: SvgNode, palette: Palette = SPRING): void {
  const allowed = paletteColours(palette);
  walk(node, (n) => {
    for (const name of COLOUR_ATTRS) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url('))
        expect(allowed.has(v.toLowerCase()), `${name}=${v}`).toBe(true);
    }
  });
  const svg = toSvgString(node);
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  expect(svg).not.toMatch(/<text/);
}

const group = (nodes: SvgNode[]): SvgNode => el('g', {}, nodes);
const count = (node: SvgNode, key: string, value: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs[key] === value) n += 1;
  });
  return n;
};

describe('fire glow', () => {
  const p = isometric(64);
  it('washes the hex and the hexes within the radius with a warm radial gradient, in every palette', () => {
    for (const palette of PALETTES) {
      const g = drawFireGlow(p, { q: 1, r: -1 }, palette);
      clean(g, palette);
      expect(g.attrs['data-fire-glow']).toBe('1,-1');
      const fill = g.children[1]!;
      expect(String(fill.attrs.d).match(/M/g)).toHaveLength(7);
      expect(String(fill.attrs.fill)).toMatch(/^url\(#/);
      let stops = 0;
      walk(g, (n) => {
        if (n.tag === 'stop') {
          stops += 1;
          expect([palette.accents.coral.base, palette.accents.ochre.base]).toContain(
            n.attrs['stop-color'],
          );
        }
      });
      expect(stops).toBe(3);
    }
    expect(
      String(drawFireGlow(p, { q: 0, r: 0 }, SPRING, 2).children[1]!.attrs.d).match(/M/g),
    ).toHaveLength(19);
  });

  it('is strongest at the centre and survives bad radii and the top-down view', () => {
    const g = drawFireGlow(topDown(), { q: 0, r: 0 }, SPRING, Number.NaN);
    clean(g);
    const stops: number[] = [];
    walk(g, (n) => {
      if (n.tag === 'stop') stops.push(Number(n.attrs['stop-opacity']));
    });
    expect(stops[0]).toBeGreaterThan(stops[2]!);
    expect(stops[2]).toBeGreaterThanOrEqual(0.2);
  });

  it('gives different gradient ids to different fires', () => {
    const idOf = (q: number): string => {
      let id = '';
      walk(drawFireGlow(p, { q, r: 0 }, SPRING), (n) => {
        if (n.tag === 'radialGradient') id = String(n.attrs.id);
      });
      return id;
    };
    expect(idOf(0)).not.toBe(idOf(1));
    expect(idOf(0)).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('fire marks, redrawn', () => {
  it('are drawn with a jagged flame (straight edges, many points), not a teardrop', () => {
    const flame = jaggedFlame(0, 0, 10, 10);
    expect(flame.length).toBeGreaterThanOrEqual(10);
    for (const palette of PALETTES) {
      for (const mark of [drawFearsFireMark(palette, 48), drawBurnableMark(palette, 48)]) {
        clean(mark, palette);
        let jagged = 0;
        walk(mark, (n) => {
          const d = n.attrs.d;
          if (typeof d === 'string' && /^M[^CAQ]*Z$/.test(d) && (d.match(/L/g) ?? []).length >= 9)
            jagged += 1;
        });
        expect(jagged).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('fears-fire shows a beast (an eye, legs) and speed lines; burnable a log under the flame', () => {
    const fears = drawFearsFireMark(SPRING, 64);
    expect(fears.attrs['data-mark']).toBe('fears-fire');
    const burn = drawBurnableMark(SPRING, 64);
    expect(burn.attrs['data-mark']).toBe('burnable');
    expect(toSvgString(fears)).not.toBe(toSvgString(burn));
    expect(toSvgString(fears)).toContain(SPRING.ramps.hide.base);
    expect(toSvgString(burn)).toContain(SPRING.ramps.bark.base);
  });
});

describe('pinned, lying down', () => {
  const origin = { x: 200, y: 120 };
  const stand = drawCharacter(SPRING, 'sage', origin, 100, 0.8, 1.4);

  it('lays the standee almost flat without its footing', () => {
    const lying = liePinned(stand, origin, 100);
    const text = toSvgString(group(lying.nodes));
    const turn = /rotate\((-?[\d.]+) /.exec(text);
    expect(Math.abs(Number(turn![1]))).toBeGreaterThanOrEqual(75);
    expect(Math.abs(Number(turn![1]))).toBeLessThanOrEqual(90);
    // The first parts of a standee are its shadow and footing disc; the lying figure drops exactly those.
    expect(stand.nodes[0]!.attrs.fill).toBe(SPRING.shadow);
    expect(stand.nodes[1]!.attrs.fill).toBe(SPRING.paperDeep);
    expect(stand.nodes[2]!.attrs.stroke).toBe(SPRING.ink);
    expect(stand.nodes[FOOTING_NODES]!.attrs.fill).not.toBe(SPRING.paperDeep);
    expect(JSON.stringify(lying.nodes)).not.toContain(SPRING.shadow);
    clean(group(lying.nodes));
    // It runs left of the feet, further than it is tall.
    expect(lying.box.x1 - lying.box.x0).toBeGreaterThan(lying.box.y1 - lying.box.y0);
  });

  it('heaps stones over the body with the head and an arm out, as big as the old heap', () => {
    for (const palette of PALETTES) {
      const d = drawPinned(palette, origin, 100, 0.8, 1.4);
      clean(group(d.nodes), palette);
      expect(count(group(d.nodes), 'data-mark', 'pinned')).toBeGreaterThan(8);
      for (const v of Object.values(d.box)) expect(Number.isFinite(v)).toBe(true);
    }
    const d = drawPinned(SPRING, origin, 100, 0.8, 1.4);
    const k = (100 * 0.74) / 50;
    // Wider than the old heap (about 36 k) and the arm reaches well past the feet.
    expect(d.box.x1 - d.box.x0).toBeGreaterThan(40 * k);
    expect(d.box.x0).toBeLessThan(origin.x - 55 * k);
    expect(toSvgString(group(d.nodes))).toBe(
      toSvgString(group(drawPinned(SPRING, origin, 100, 0.8, 1.4).nodes)),
    );
  });

  it('is what a scene draws for a pinned character', () => {
    const cells = [{ q: 0, r: 0, terrain: 'plains' }];
    const scene = (pinned: boolean): string =>
      toSvgString(
        renderScene({
          cells,
          projection: isometric(),
          palette: SPRING,
          seed: 's',
          characters: [
            { id: 'a', q: 0, r: 0, accent: 'sage', ...(pinned ? { marks: { pinned: true } } : {}) },
          ],
        }),
      );
    expect(scene(true)).toContain('data-mark="pinned-body"');
    expect(scene(false)).not.toContain('pinned-body');
  });
});

describe('blocked hexes', () => {
  const p = isometric(64);
  const hexes = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 1, r: 1 },
  ];
  it('draws diagonal stripes, a thin edge and a fire mark, in every palette', () => {
    for (const palette of PALETTES) {
      const g = drawBlockedHexes(p, hexes, palette, { reason: 'fire' });
      clean(g, palette);
      expect(g.attrs['data-blocked']).toBe(3);
      let pattern: SvgNode | undefined;
      walk(g, (n) => {
        if (n.tag === 'pattern') pattern = n;
      });
      expect(String(pattern!.attrs.patternTransform)).toMatch(/rotate\(45\)/);
      expect(count(g, 'data-reason', 'fire')).toBe(1);
      expect(toSvgString(g)).toContain(palette.accents.coral.shade);
    }
  });

  it('draws the rim once round the cluster (not between its hexes) and no mark without a reason', () => {
    const g = drawBlockedHexes(p, hexes, SPRING);
    expect(count(g, 'data-reason', 'fire')).toBe(0);
    const rim = g.children.find((n) => n.tag === 'path' && n.attrs.fill === 'none')!;
    // A chain of three hexes with two shared sides: 18 edges less 2 x 2 counted twice = 14.
    expect(String(rim.attrs.d).match(/M/g)).toHaveLength(14);
  });

  it('ignores duplicates and bad hexes, is deterministic, and differs by cluster', () => {
    const a = toSvgString(drawBlockedHexes(p, hexes, SPRING));
    expect(
      toSvgString(drawBlockedHexes(p, [...hexes, hexes[0]!, { q: Number.NaN, r: 0 }], SPRING)),
    ).toBe(a);
    expect(toSvgString(drawBlockedHexes(p, [{ q: 4, r: 4 }], SPRING))).not.toContain(
      a.slice(0, 0) + 'M0 ',
    );
    const none = drawBlockedHexes(p, [], SPRING, { reason: 'fire' });
    expect(none.children).toHaveLength(0);
    expect(toSvgString(drawBlockedHexes(p, [{ q: 4, r: 4 }], SPRING))).not.toBe(a);
  });

  it('survives the top-down view and an unknown reason', () => {
    const g = drawBlockedHexes(topDown(), hexes, SPRING, { reason: 'nope' });
    clean(g);
    expect(count(g, 'data-reason', 'fire')).toBe(0);
  });
});

describe('hazard terrains', () => {
  const ids = ['glass-waste', 'poisoned-lake'] as const;
  it('are in the terrain system with their own ground, marks and props', () => {
    expect(terrainLook('glass-waste')).toMatchObject({ ground: 'glass', marks: 'shards' });
    expect(terrainLook('poisoned-lake')).toMatchObject({ ground: 'toxic', marks: 'murk' });
    expect(terrainLook('glass-waste').props[0]!.kind).toBe('shards');
    expect(terrainLook('poisoned-lake').props[0]!.kind).toBe('deadreed');
  });

  for (const palette of PALETTES) {
    it(`keep clear of the other grounds in ${palette.id}: ramps in order, not blue, apart under colour blindness`, () => {
      const ramp = (id: string) => palette.ramps[terrainLook(id).ground];
      for (const id of ids) {
        const r = ramp(id);
        expect(lightness(r.light), id).toBeGreaterThan(lightness(r.base));
        expect(lightness(r.base), id).toBeGreaterThan(lightness(r.shade));
        expect(lightness(r.shade), id).toBeGreaterThan(30);
        const m = /^#(..)(..)(..)$/.exec(r.base)!;
        expect(
          parseInt(m[3]!, 16) - Math.max(parseInt(m[1]!, 16), parseInt(m[2]!, 16)),
          id,
        ).toBeLessThan(15);
      }
      const others = ['desert', 'plains', 'lake', 'cliff', 'forest', 'swamp', 'sea', 'shallows'];
      for (const id of ids) {
        for (const other of [...others, ...ids.filter((x) => x !== id)]) {
          for (const vision of VISION) {
            expect(
              deltaE(ramp(id).base, ramp(other).base, vision),
              `${id} and ${other} (${vision})`,
            ).toBeGreaterThanOrEqual(10);
          }
        }
      }
    });

    it(`draw in ${palette.id}: palette colours, deterministic, shards and dead reeds in the scene`, () => {
      const cells = [
        { q: 0, r: 0, terrain: 'glass-waste' },
        { q: 1, r: 0, terrain: 'poisoned-lake' },
        { q: 0, r: 1, terrain: 'plains' },
      ];
      const draw = (): SvgNode =>
        renderScene({ cells, projection: isometric(), palette, seed: 'h' });
      const scene = draw();
      clean(scene, palette);
      expect(toSvgString(scene)).toBe(toSvgString(draw()));
      const text = toSvgString(scene);
      expect(text).toContain(palette.ramps.glass.base);
      expect(text).toContain(palette.ramps.toxic.base);
      expect(text).toContain(palette.accents.plum.light);
    });
  }

  it('draw a taller shard cluster than a rock', () => {
    const tall = (terrain: string) => {
      const s = renderScene({
        cells: [{ q: 0, r: 0, terrain }],
        projection: isometric(),
        palette: SPRING,
        seed: 'x',
      });
      return Number(String(s.attrs.viewBox).split(' ')[3]);
    };
    expect(tall('glass-waste')).toBeGreaterThan(tall('plains') * 0.9);
  });

  it('have an icon each, in every palette, sized and different', () => {
    const seen = new Set<string>();
    for (const palette of PALETTES)
      for (const key of HAZARD_ICON_KEYS) {
        const icon = drawHazardIcon(key, palette, 40);
        clean(icon, palette);
        expect(icon.attrs.width).toBe(40);
        if (palette === SPRING) seen.add(toSvgString(icon));
      }
    expect(seen.size).toBe(HAZARD_ICON_KEYS.length);
    expect(drawHazardIcon('nope', SPRING, Number.NaN).attrs.width).toBe(48);
  });

  it('draw a scree field of loose stones over the hexes, seeded and in the palette', () => {
    const p = isometric(64);
    const hexes = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    for (const palette of PALETTES) clean(drawScreeField(p, hexes, palette), palette);
    const a = toSvgString(drawScreeField(p, hexes, SPRING));
    expect(toSvgString(drawScreeField(p, hexes, SPRING))).toBe(a);
    expect(toSvgString(drawScreeField(p, hexes, SPRING, 'other'))).not.toBe(a);
    expect(drawScreeField(p, hexes, SPRING).attrs['data-scree']).toBe(2);
    expect(drawScreeField(p, [], SPRING).attrs['data-scree']).toBe(0);
  });
});

describe('capybara', () => {
  for (const palette of PALETTES)
    for (const state of CAPYBARA_STATES) {
      it(`draws ${state} in ${palette.id}`, () => {
        const d = drawCapybara(palette, state, { origin: { x: 50, y: 80 }, seed: 1 });
        clean(group(d.nodes), palette);
        expect(d.nodes.length).toBeGreaterThan(6);
        for (const v of Object.values(d.box)) expect(Number.isFinite(v)).toBe(true);
      });
    }

  it('is small and round, settled lower than normal, deterministic, scaling with k', () => {
    const normal = drawCapybara(SPRING, 'normal', { k: 1 });
    const settled = drawCapybara(SPRING, 'settled', { k: 1 });
    const w = normal.box.x1 - normal.box.x0;
    const h = normal.box.y1 - normal.box.y0;
    expect(w).toBeLessThan(64);
    expect(w / h).toBeLessThan(2.4);
    expect(settled.box.y1 - settled.box.y0).toBeLessThan(h);
    expect(toSvgString(group(normal.nodes))).not.toBe(toSvgString(group(settled.nodes)));
    expect(toSvgString(group(drawCapybara(SPRING, 'normal', { k: 1 }).nodes))).toBe(
      toSvgString(group(normal.nodes)),
    );
    const big = drawCapybara(SPRING, 'normal', { k: 2 });
    expect(big.box.x1 - big.box.x0).toBeGreaterThan(w * 1.8);
    expect(toSvgString(group(drawCapybara(SPRING, 'unknown', { k: 1 }).nodes))).toBe(
      toSvgString(group(normal.nodes)),
    );
  });

  it('shows one pawprint per lead left, up to three, and sizes itself', () => {
    for (const n of [0, 1, 2, 3]) {
      const m = drawLeadsLeft(SPRING, n, 30);
      expect(count(m, 'data-lead', 'left')).toBe(n);
      expect(count(m, 'data-lead', 'spent')).toBe(LEADS_MAX - n);
      for (const palette of PALETTES) clean(drawLeadsLeft(palette, n), palette);
    }
    expect(drawLeadsLeft(SPRING, 9).children).toEqual(drawLeadsLeft(SPRING, 3).children);
    expect(drawLeadsLeft(SPRING, Number.NaN).children).toEqual(drawLeadsLeft(SPRING, 0).children);
    expect(drawLeadsLeft(SPRING, 2, 40).attrs.height).toBe(40);
    expect(drawLeadsLeft(SPRING, 2, -1).attrs.height).toBe(24);
  });
});

describe('cart', () => {
  for (const palette of PALETTES)
    for (const state of CART_STATES) {
      it(`draws ${state} in ${palette.id}`, () => {
        const d = drawCart(palette, state, { origin: { x: 60, y: 90 }, seed: 1 });
        clean(group(d.nodes), palette);
        for (const v of Object.values(d.box)) expect(Number.isFinite(v)).toBe(true);
      });
    }

  it('differs in every state, is deterministic and stays small next to a hex', () => {
    const drawn = CART_STATES.map((s) => toSvgString(group(drawCart(SPRING, s, { k: 1 }).nodes)));
    expect(new Set(drawn).size).toBe(CART_STATES.length);
    expect(toSvgString(group(drawCart(SPRING, 'loaded', { k: 1 }).nodes))).toBe(drawn[1]);
    expect(drawn[0]).toBe(toSvgString(group(drawCart(SPRING, 'nope', { k: 1 }).nodes)));
    const empty = drawCart(SPRING, 'empty', { k: 1 });
    expect(empty.box.x1 - empty.box.x0).toBeLessThan(64 * 1.2);
    // Loaded rises above empty (crates and logs); a rider and a puller rise higher than the bed.
    const top = (s: string): number => drawCart(SPRING, s, { k: 1 }).box.y0;
    expect(top('loaded')).toBeLessThan(top('empty'));
    expect(top('rider')).toBeLessThan(top('empty'));
    expect(top('hitched')).toBeLessThan(top('empty'));
  });

  it('shows crates, logs, a rider and a puller as parts', () => {
    const text = (s: string): string =>
      toSvgString(group(drawCart(SPRING, s, { k: 1, accent: 'rose' }).nodes));
    expect(text('rider')).toContain(SPRING.accents.rose.base);
    expect(text('hitched')).toContain(SPRING.accents.rose.base);
    expect(text('empty')).not.toContain(SPRING.accents.rose.base);
  });

  it('draws the cargo fill mark: filled crates follow the fill, and it sizes itself', () => {
    for (const [fill, slots, full] of [
      [0, 5, 0],
      [0.4, 5, 2],
      [1, 5, 5],
      [2, 4, 4],
      [Number.NaN, 5, 0],
      [0.5, 99, 4],
    ] as const) {
      const m = drawCargoFill(SPRING, fill, slots, 30);
      expect(count(m, 'data-cargo', 'full'), `${fill}/${slots}`).toBe(full);
      for (const palette of PALETTES) clean(drawCargoFill(palette, fill, slots), palette);
    }
    expect(drawCargoFill(SPRING, 0.5, 5, 40).attrs.height).toBe(40);
    expect(drawCargoFill(SPRING, 0.5, 5, -2).attrs.height).toBe(24);
  });
});

describe('action icons for the lure, cart and pinned', () => {
  const keys = ['lead', 'hitch', 'board-cart', 'load', 'unload', 'struggle'];
  it('are in the action set, drawn in every palette, all different and not the neutral mark', () => {
    const neutral = toSvgString(drawIcon('no-such-action', SPRING, 48));
    const seen = new Set<string>();
    for (const key of keys) {
      expect(Object.hasOwn(ACTION_MOTIFS, key), key).toBe(true);
      for (const palette of PALETTES) clean(drawIcon(key, palette, 48), palette);
      const s = toSvgString(drawIcon(key, SPRING, 48));
      expect(s).not.toBe(neutral);
      seen.add(s);
    }
    expect(seen.size).toBe(keys.length);
  });
});

describe('odds mark', () => {
  it('splits a bar by the chance of success, in every palette', () => {
    for (const palette of PALETTES)
      for (const failure of ODDS_FAILURES) {
        const m = drawOddsMark(palette, 0.6, failure);
        clean(m, palette);
        expect(count(m, 'data-odds', 'success')).toBe(1);
        expect(count(m, 'data-odds', 'failure')).toBe(1);
        expect(m.attrs['data-success']).toBe(60);
        expect(m.attrs['data-failure']).toBe(failure);
      }
    const width = (s: number): number => {
      const m = drawOddsMark(SPRING, s, 'rocks');
      const part = m.children.find((n) => n.attrs['data-odds'] === 'success');
      return part ? Number(/h([\d.]+)/.exec(String(part.attrs.d))![1]) : 0;
    };
    expect(width(0.25)).toBeLessThan(width(0.5));
    expect(width(0.5)).toBeLessThan(width(0.9));
    expect(width(0)).toBe(0);
  });

  it('uses a calm colour for success and a warning colour for failure', () => {
    const m = drawOddsMark(SPRING, 0.5, 'anger');
    const fills = new Map<string, string>();
    for (const n of m.children)
      if (n.attrs['data-odds']) fills.set(String(n.attrs['data-odds']), String(n.attrs.fill));
    expect(fills.get('success')).toBe(SPRING.accents.sage.base);
    expect(fills.get('failure')).toBe(SPRING.accents.coral.base);
  });

  it('maps each failure to its own badge', () => {
    const badge = (f: string): string => {
      const m = drawOddsMark(SPRING, 0.5, f);
      return toSvgString(m.children.find((n) => n.attrs['data-badge'] === 'failure')!);
    };
    const badges = ['rocks', 'anger', 'harm', 'anything'].map(badge);
    expect(new Set(badges).size).toBe(3);
    expect(badges[2]).toBe(badges[3]);
    expect(badges[0]).toContain(SPRING.ramps.rock.base);
    expect(badges[1]).toContain(SPRING.accents.coral.base);
  });

  it('draws a row of five pips, clamps bad values and sizes itself', () => {
    for (const [s, good] of [
      [0, 0],
      [0.4, 2],
      [1, 5],
      [7, 5],
      [-1, 0],
      [Number.NaN, 0],
    ] as const) {
      const m = drawOddsMark(SPRING, s, 'rocks', { style: 'pips' });
      expect(count(m, 'data-odds', 'success'), `${s}`).toBe(good);
      expect(count(m, 'data-odds', 'failure'), `${s}`).toBe(5 - good);
      for (const palette of PALETTES)
        clean(drawOddsMark(palette, s, 'anger', { style: 'pips' }), palette);
    }
    expect(drawOddsMark(SPRING, 0.5, 'rocks', { size: 40 }).attrs.height).toBe(40);
    expect(drawOddsMark(SPRING, 0.5, 'rocks', { size: 40 }).attrs.width).toBe(144);
    expect(drawOddsMark(SPRING, 0.5, 'rocks', { size: -3 }).attrs.height).toBe(20);
    clean(drawOddsMark(SPRING, Number.NaN, 'rocks'));
  });

  it('keeps both parts visible for any chance between none and certain', () => {
    for (const s of [0.01, 0.99]) {
      const m = drawOddsMark(SPRING, s, 'rocks');
      expect(count(m, 'data-odds', 'success')).toBe(1);
      expect(count(m, 'data-odds', 'failure')).toBe(1);
    }
  });
});

describe('round 13 review sheets', () => {
  it('adds five Spring-only items with unique ids and clean svg', () => {
    const items = buildReviewItems().filter((i) => i.id.startsWith('r13/'));
    expect(items.map((i) => i.id)).toEqual([
      'r13/blocked',
      'r13/hazards',
      'r13/capybara',
      'r13/cart',
      'r13/odds',
    ]);
    const other = PALETTES.filter((p) => p !== SPRING);
    for (const i of items) {
      expect(i.svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(i.svg).not.toMatch(/<text/);
      for (const palette of other)
        expect(i.svg, `${i.id} ${palette.id}`).not.toContain(palette.ink);
    }
  });

  it('shows the new fire sheets in Spring only too', () => {
    const items = buildReviewItems().filter((i) =>
      ['fire/brazier', 'fire/ring', 'fire/marks', 'fire/pinned-burnt'].includes(i.id),
    );
    for (const i of items)
      for (const palette of PALETTES.filter((p) => p !== SPRING))
        expect(i.svg, `${i.id} ${palette.id}`).not.toContain(palette.ink);
  });
});
