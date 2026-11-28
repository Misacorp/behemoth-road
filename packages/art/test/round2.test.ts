import { describe, expect, it } from 'vitest';
import { drawDefended, DEFENDED_MAX } from '../src/defended.ts';
import { drawIcon } from '../src/icons.ts';
import { GENTLE_AMBLER } from '../src/creature.ts';
import { MORNING, paletteColours, SPRING } from '../src/palette.ts';
import { DIRECTIONS, hexCenter, hexCorners, isometric } from '../src/projection.ts';
import { ART_TUNING } from '../src/config.ts';
import { renderScene, renderSceneFramed } from '../src/scene.ts';
import { toSvgString, walk, type SvgNode } from '../src/svg.ts';
import type { ArtCell } from '../src/tile.ts';

const p = isometric();
const count = (node: SvgNode, attr: string, value: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (String(x.attrs[attr]) === value) n += 1;
  });
  return n;
};
const find = (node: SvgNode, attr: string, value: string): SvgNode | undefined => {
  let out: SvgNode | undefined;
  walk(node, (x) => {
    if (String(x.attrs[attr]) === value) out ??= x;
  });
  return out;
};
const scene = (cells: ArtCell[], extra: Record<string, unknown> = {}) =>
  renderScene({ cells, projection: p, palette: SPRING, seed: 'r2', ...extra });
const maxY = (d: string): number =>
  Math.max(...[...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2])));

describe('veil and draw order', () => {
  it('never lets a veil reach down over the top of the tile in front of it', () => {
    // DIRECTIONS[0..2] face the viewer (down the screen); put a seen tile in front of a veiled one.
    const fronts = DIRECTIONS.slice(0, 3);
    const veiledAlone = scene([{ q: 0, r: 0, terrain: 'plains', state: 'unexplored', props: [] }]);
    const veiledBehind = scene([
      { q: 0, r: 0, terrain: 'plains', state: 'unexplored', props: [] },
      ...fronts.map((f) => ({ q: f.q, r: f.r, terrain: 'plains', props: [] })),
    ]);
    const tile = hexCorners(p, hexCenter(p, 0, 0));
    const bottom = Math.max(...tile.map((c) => c.y));
    const alone = maxY(String(find(veiledAlone, 'data-veil', 'all')!.attrs.d));
    const behind = maxY(String(find(veiledBehind, 'data-veil', 'all')!.attrs.d));
    // On its own the veil covers the side faces too; with a tile in front it stops at the tile's own edge.
    expect(alone).toBeGreaterThan(bottom + 1);
    expect(behind).toBeLessThanOrEqual(bottom + 0.01 + p.depth * 0);
  });

  it('draws the unexplored veil dark, with thick stripes and the terrain still under it', () => {
    const svg = scene([{ q: 0, r: 0, terrain: 'plains', state: 'unexplored', props: [] }]);
    const pattern = find(svg, 'patternTransform', 'rotate(32)')!;
    const base = pattern.children.find((c) => c.tag === 'rect')!;
    const stripe = pattern.children.find((c) => c.tag === 'path')!;
    // Darker than the old paper-deep base, and not opaque: the terrain's hue stays faintly readable.
    expect(base.attrs.fill).toBe(SPRING.shadow);
    expect(Number(base.attrs.opacity)).toBeGreaterThan(0.6);
    expect(Number(base.attrs.opacity)).toBeLessThan(0.85);
    // Thick stripes (the old hatch was 0.7 wide) on a longer period.
    expect(Number(stripe.attrs['stroke-width'])).toBeCloseTo(ART_TUNING.veilStripe * p.k);
    expect(ART_TUNING.veilStripe).toBeGreaterThanOrEqual(4);
    expect(Number(pattern.attrs.width)).toBeCloseTo(ART_TUNING.veilPeriod * p.k);
  });
});

describe('trodden ground', () => {
  const cells: ArtCell[] = [
    { q: 0, r: 0, terrain: 'plains', props: [] },
    ...DIRECTIONS.map((d) => ({ q: d.q, r: d.r, terrain: 'cliff' })),
  ];
  const creature = { q: 0, r: 0, heading: DIRECTIONS[0]!, look: GENTLE_AMBLER };

  it('is a neutral sandy wash that keeps the terrain readable, cliffs and their props included', () => {
    const svg = renderScene({
      cells,
      creature,
      projection: p,
      palette: MORNING,
      seed: 'r2',
      effects: 'lite',
    });
    const text = toSvgString(svg);
    // The cliff's own ground and scree still show under the wash, and the wash is half transparent.
    expect(text).toContain(MORNING.ramps.rock.base);
    expect(text).toMatch(new RegExp(`fill="${MORNING.ramps.trodden.base}" opacity="0.5"`));
    // Not pink: red does not lead the sandy tone by much.
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(MORNING.ramps.trodden.base.slice(i, i + 2), 16),
    );
    expect(r! - g!).toBeLessThan(20);
    expect(g! - b!).toBeGreaterThan(10);
    // The ring's cliffs keep their props (the creature's own hex has none).
    const without = renderScene({
      cells: cells.map((c) => ({ ...c, props: [] })),
      creature,
      projection: p,
      palette: MORNING,
      seed: 'r2',
      effects: 'lite',
    });
    expect(countNodes(svg)).toBeGreaterThan(countNodes(without));
  });
});

const countNodes = (n: SvgNode): number => {
  let c = 0;
  walk(n, () => (c += 1));
  return c;
};

describe('features rising from the ground', () => {
  const one = (feature: NonNullable<ArtCell['feature']>): SvgNode =>
    scene([{ q: 0, r: 0, terrain: 'plains', feature }], { effects: 'lite' });

  it('give every live trap one shared danger cue, and nodes and sites none', () => {
    for (const look of ['snare', 'pitfall', 'undertow']) {
      const svg = one({ look });
      expect(count(svg, 'data-footing', 'teeth'), look).toBe(1);
      expect(count(svg, 'data-mark', 'danger'), look).toBe(1);
    }
    // Any trap the content says is one, whatever its look.
    expect(count(one({ look: 'brand-new-trap', trap: true }), 'data-mark', 'danger')).toBe(1);
    for (const look of ['ore', 'berries', 'tomb', 'deep-tomb', 'shrine']) {
      const svg = one({ look });
      expect(count(svg, 'data-footing', 'teeth'), look).toBe(0);
      expect(count(svg, 'data-mark', 'danger'), look).toBe(0);
    }
  });

  it('mutes the cue once the trap is harmless: teeth flat and grey, no pennant', () => {
    const svg = one({ look: 'snare', state: 'spent' });
    expect(count(svg, 'data-footing', 'teeth')).toBe(1);
    expect(count(svg, 'data-mark', 'danger')).toBe(0);
    expect(find(svg, 'data-footing', 'teeth')!.attrs.fill).not.toBe(SPRING.accents.coral.base);
  });

  const framedOf = (cell: Partial<ArtCell>, extra: Record<string, unknown> = {}) =>
    renderSceneFramed({
      cells: [{ q: 0, r: 0, terrain: 'plains', ...cell }],
      projection: p,
      palette: SPRING,
      seed: 'r2',
      effects: 'lite',
      ...extra,
    });
  const tileTop = Math.min(...hexCorners(p, hexCenter(p, 0, 0)).map((c) => c.y));
  const pad = ART_TUNING.padding * p.size;
  // The frame is the drawing's box plus padding: where the drawing's own top is.
  const drawnTop = (cell: Partial<ArtCell>): number => framedOf(cell).viewBox.y + pad;

  it('has no raised platform: a soft footing only, and every look rises above the tile top', () => {
    for (const look of [
      'ore',
      'tomb',
      'deep-tomb',
      'logs',
      'shrine',
      'berries',
      'outcrop',
      'stones',
      'fieldstones',
      'deadfall',
      'snare',
    ]) {
      const svg = one({ look });
      for (const part of ['wall', 'disc', 'rim', 'lip'])
        expect(count(svg, 'data-footing', part), look).toBe(0);
      expect(count(svg, 'data-footing', 'shadow'), look).toBe(1);
      // Intended overflow: the drawing reaches clear above the tile's top edge.
      expect(drawnTop({ feature: { look } }), look).toBeLessThan(tileTop - 0.2 * p.size);
    }
  });

  it('draws tall looks taller than short ones, and settlements and fires above their tile too', () => {
    expect(drawnTop({ feature: { look: 'ore' } })).toBeLessThan(
      drawnTop({ feature: { look: 'stones' } }),
    );
    expect(drawnTop({ settlement: { look: 'hill-folk', attitude: 'wary' } })).toBeLessThan(tileTop);
    expect(drawnTop({ fire: true })).toBeLessThan(tileTop);
  });

  it('draws the tile behind first and the tile in front later, so a tall feature never covers it', () => {
    const front = DIRECTIONS[1]!;
    const svg = scene(
      [
        { q: front.q, r: front.r, terrain: 'plains', feature: { look: 'tomb' } },
        { q: 0, r: 0, terrain: 'plains', feature: { look: 'ore' } },
      ],
      { effects: 'lite' },
    );
    const ys: number[] = [];
    walk(svg, (n) => {
      if (n.attrs['data-footing'] === 'shadow')
        ys.push(Number(/ ([-\d.]+)/.exec(String(n.attrs.d))![1]));
    });
    expect(ys).toHaveLength(2);
    expect(ys[0]!).toBeLessThan(ys[1]!);
  });

  it('keeps a character standing on the tile in front of its tall feature', () => {
    const framed = framedOf(
      { feature: { look: 'ore' } },
      { characters: [{ id: 'a', q: 0, r: 0, accent: 'rose' }] },
    );
    const feet = framed.figures.get('a')!;
    expect(feet.y).toBeGreaterThan(hexCenter(p, 0, 0).y);
  });
});

describe('the defended mark', () => {
  const org = { x: 100, y: 100 };

  it('draws one shield per defender up to the cap, and nothing for none', () => {
    expect(drawDefended(SPRING, org, 64, 0.8, 1.4, 0).banner.nodes).toHaveLength(0);
    for (const n of [1, 2, 3]) {
      const d = drawDefended(SPRING, org, 64, 0.8, 1.4, n);
      expect(find(d.banner.nodes[0]!, 'data-count', String(n))).toBeDefined();
      expect(d.banner.nodes[0]!.children).toHaveLength(n * 3);
    }
    const many = drawDefended(SPRING, org, 64, 0.8, 1.4, 40);
    expect(many.banner.nodes[0]!.children).toHaveLength(DEFENDED_MAX * 3);
    expect(toSvgString(many.ground.nodes[0]!)).not.toMatch(/NaN|undefined/);
  });

  it('shows on the scene from the creature or from characters marked defending', () => {
    const cells: ArtCell[] = [{ q: 0, r: 0, terrain: 'plains', props: [] }];
    const creature = { q: 0, r: 0, heading: DIRECTIONS[0]!, look: GENTLE_AMBLER };
    const none = scene(cells, { creature });
    expect(count(none, 'data-mark', 'defended')).toBe(0);
    const two = scene(cells, { creature: { ...creature, defenders: 2 } });
    expect(count(two, 'data-mark', 'defended')).toBe(2);
    const marked = scene(cells, {
      creature,
      characters: [
        { id: 'a', q: 0, r: 0, accent: 'rose', marks: { defending: true } },
        { id: 'b', q: 0, r: 0, accent: 'teal', marks: { defending: true } },
        { id: 'c', q: 0, r: 0, accent: 'sage' },
      ],
    });
    expect(find(marked, 'data-count', '2')).toBeDefined();
  });

  it('stays inside the allowlist and palette', () => {
    const allowed = paletteColours(SPRING);
    const d = drawDefended(SPRING, org, 64, 0.8, 1.4, 3);
    for (const part of [d.ground.nodes[0]!, d.banner.nodes[0]!]) {
      walk(part, (n) => {
        for (const name of ['fill', 'stroke']) {
          const v = n.attrs[name];
          if (typeof v === 'string' && v !== 'none')
            expect(allowed.has(v.toLowerCase())).toBe(true);
        }
      });
    }
  });
});

describe('role emblems', () => {
  it('use the shield frame unless another is asked for', () => {
    const plain = toSvgString(drawIcon('role:scout', SPRING, 48));
    expect(plain).toBe(toSvgString(drawIcon('role:scout', SPRING, 48, { frame: 'shield' })));
    expect(plain).not.toBe(toSvgString(drawIcon('role:scout', SPRING, 48, { frame: 'roundel' })));
  });
});
