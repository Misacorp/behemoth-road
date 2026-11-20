import { describe, expect, it } from 'vitest';
import {
  drawEmptyMark,
  drawMisledMark,
  drawOutOfReachMark,
  drawRoleBadge,
  FEEDBACK_MOMENT_KINDS,
} from '../src/feedback-marks.ts';
import { ROLE_IDS } from '../src/icons.ts';
import { MOMENT_KINDS } from '../src/marks.ts';
import { paletteColours, SPRING } from '../src/palette.ts';
import { isometric } from '../src/projection.ts';
import { renderScene } from '../src/scene.ts';
import { toSvgString, walk, type SvgNode } from '../src/svg.ts';
import type { ArtCell } from '../src/tile.ts';

const allowed = paletteColours(SPRING);
const within = (node: SvgNode): void => {
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url('))
        expect(allowed.has(v.toLowerCase()), v).toBe(true);
    }
  });
  expect(toSvgString(node)).not.toMatch(/NaN|undefined|Infinity|<text/);
};
const count = (node: SvgNode, attr: string, value: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs[attr] === value) n += 1;
  });
  return n;
};
const scene = (cells: ArtCell[], effects?: 'lite') =>
  renderScene({
    cells,
    projection: isometric(),
    palette: SPRING,
    seed: 'plinth',
    ...(effects ? { effects } : {}),
  });

describe('feature plinths', () => {
  it('stand under every feature and settlement, never under plain props, in full and lite', () => {
    for (const effects of [undefined, 'lite'] as const) {
      const props = scene(
        [
          { q: 0, r: 0, terrain: 'rocks' },
          { q: 1, r: 0, terrain: 'forest' },
        ],
        effects,
      );
      expect(count(props, 'data-plinth', 'rim')).toBe(0);
      const features = scene(
        [
          { q: 0, r: 0, terrain: 'plains', feature: { look: 'fieldstones' } },
          { q: 1, r: 0, terrain: 'plains', feature: { look: 'snare' } },
          { q: 2, r: 0, terrain: 'plains', feature: { look: 'ore', state: 'depleted' } },
          { q: 0, r: 1, terrain: 'plains', settlement: { look: 'hill-folk', attitude: 'wary' } },
        ],
        effects,
      );
      expect(count(features, 'data-plinth', 'rim')).toBe(4);
      expect(count(features, 'data-plinth', 'disc')).toBe(4);
      within(features);
    }
  });

  it('stays off a feature still under the veil', () => {
    const veiled = scene([
      { q: 0, r: 0, terrain: 'plains', state: 'unexplored', feature: { look: 'ore' } },
    ]);
    expect(count(veiled, 'data-plinth', 'rim')).toBe(0);
  });
});

describe('feedback marks', () => {
  it('fades the explored-empty mark out', () => {
    expect(drawEmptyMark(SPRING, 24).attrs.opacity).toBe(0.7);
    expect(drawEmptyMark(SPRING, 24, 0.5).attrs.opacity).toBe(0.35);
    expect(drawEmptyMark(SPRING, 24, 1).attrs.opacity).toBe(0);
    expect(drawEmptyMark(SPRING, 24, Number.NaN).attrs.opacity).toBe(0.7);
    within(drawEmptyMark(SPRING, 24, 0.3));
  });

  it('points the out-of-reach arrow along its angle', () => {
    const east = toSvgString(drawOutOfReachMark(SPRING, 32));
    expect(toSvgString(drawOutOfReachMark(SPRING, 32, Math.PI / 2))).not.toBe(east);
    expect(toSvgString(drawOutOfReachMark(SPRING, 32, Number.NaN))).toBe(east);
    within(drawOutOfReachMark(SPRING, 32, 1));
  });

  it('draws a badge per role, distinct, and a neutral one for an unknown role', () => {
    const badges = ROLE_IDS.map((r) => toSvgString(drawRoleBadge(r, SPRING, 20)));
    expect(new Set(badges).size).toBe(ROLE_IDS.length);
    expect(badges).not.toContain(toSvgString(drawRoleBadge('nobody', SPRING, 20)));
    for (const r of [...ROLE_IDS, 'nobody']) within(drawRoleBadge(r, SPRING, 20));
    expect(drawRoleBadge('scout', SPRING, -1).attrs.width).toBe(20);
  });

  it('draws the misled mark, and the new moments are moment kinds', () => {
    within(drawMisledMark(SPRING, 24));
    for (const kind of FEEDBACK_MOMENT_KINDS) expect(MOMENT_KINDS).toContain(kind);
  });
});
