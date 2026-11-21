import { describe, expect, it } from 'vitest';
import { drawDefended, DEFENDED_MAX } from '../src/defended.ts';
import { drawIcon } from '../src/icons.ts';
import { GENTLE_AMBLER } from '../src/creature.ts';
import { MORNING, paletteColours, SPRING } from '../src/palette.ts';
import { DIRECTIONS, hexCenter, hexCorners, isometric } from '../src/projection.ts';
import { renderScene } from '../src/scene.ts';
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

  it('draws the unexplored veil darker than paper, with its stripes', () => {
    const svg = scene([{ q: 0, r: 0, terrain: 'plains', state: 'unexplored', props: [] }]);
    const pattern = find(svg, 'patternTransform', 'rotate(32)')!;
    const fills = pattern.children.map((c) => c.attrs.fill).filter(Boolean);
    expect(fills).toContain(SPRING.paperDeep);
    expect(fills).not.toContain(SPRING.paper);
    expect(pattern.children.some((c) => c.tag === 'path')).toBe(true);
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

describe('features standing on plinths', () => {
  const one = (feature: NonNullable<ArtCell['feature']>): SvgNode =>
    scene([{ q: 0, r: 0, terrain: 'plains', feature }], { effects: 'lite' });

  it('give every live trap one shared danger cue, and nodes and sites none', () => {
    for (const look of ['snare', 'pitfall', 'undertow']) {
      const svg = one({ look });
      expect(count(svg, 'data-plinth', 'teeth'), look).toBe(1);
      expect(count(svg, 'data-mark', 'danger'), look).toBe(1);
    }
    // Any trap the content says is one, whatever its look.
    expect(count(one({ look: 'brand-new-trap', trap: true }), 'data-mark', 'danger')).toBe(1);
    for (const look of ['ore', 'berries', 'tomb', 'deep-tomb', 'shrine']) {
      const svg = one({ look });
      expect(count(svg, 'data-plinth', 'teeth'), look).toBe(0);
      expect(count(svg, 'data-mark', 'danger'), look).toBe(0);
    }
  });

  it('mutes the cue once the trap is harmless: teeth flat and grey, no pennant', () => {
    const svg = one({ look: 'snare', state: 'spent' });
    expect(count(svg, 'data-plinth', 'teeth')).toBe(1);
    expect(count(svg, 'data-mark', 'danger')).toBe(0);
    expect(find(svg, 'data-plinth', 'teeth')!.attrs.fill).not.toBe(SPRING.accents.coral.base);
  });

  it('keeps a tomb plinth behind its door, never in front of it like a mat', () => {
    // The wall's path starts at the disc's centre line: a tomb's sits further back than a plain plinth's.
    const centre = (look: string): number =>
      Number(
        /^M[-\d.]+ ([-\d.]+)/.exec(String(find(one({ look }), 'data-plinth', 'wall')!.attrs.d))![1],
      );
    expect(centre('tomb')).toBeLessThan(centre('ore') - 10);
    expect(centre('deep-tomb')).toBeLessThan(centre('ore') - 10);
  });

  it('rises: a feature draws taller than the old scale and its plinth has a wall', () => {
    const svg = one({ look: 'ore' });
    expect(count(svg, 'data-plinth', 'wall')).toBe(1);
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
