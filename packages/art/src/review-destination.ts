/**
 * Review sheets (Spring only) for round 16: the unexplored veil before and after, on every terrain (explored
 * next to veiled, so the terrain hue under the veil can be judged), and the destination's glow on a map patch
 * (over seen and fogged hexes), with the route strip's badge. The kit draws no text, so a sheet has no labels:
 * its title says which side is which.
 */
import { drawDestinationBadge, drawDestinationGlow } from './destination.ts';
import { SPRING } from './palette.ts';
import { isometric, type Hex } from './projection.ts';
import type { ReviewDraft } from './review.ts';
import { renderScene } from './scene.ts';
import { TERRAIN_LOOKS } from './terrain.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ArtCell } from './tile.ts';

const PALETTE = SPRING;
const SIZE = 38;
const PER_ROW = 3;

/** The veil as it was before round 16 (a fine hatch on pale paper), kept here only to show the difference. */
function legacyVeil(k: number): SvgNode[] {
  return [
    el('rect', { x: 0, y: 0, width: 7 * k, height: 7 * k, fill: PALETTE.paperDeep, opacity: 0.74 }),
    el('rect', { x: 0, y: 0, width: 7 * k, height: 7 * k, fill: PALETTE.shadow, opacity: 0.14 }),
    el('path', {
      d: `M${(1.5 * k).toFixed(2)} 0V${(7 * k).toFixed(2)}`,
      stroke: PALETTE.inkSoft,
      'stroke-width': 0.7 * k,
      opacity: 0.45,
    }),
  ];
}

/** The tree with its veil pattern swapped for the old one. */
function withLegacyVeil(node: SvgNode, k: number): SvgNode {
  if (node.tag === 'pattern' && String(node.attrs.id ?? '').endsWith('-veil')) {
    return el('pattern', { ...node.attrs, width: 7 * k, height: 7 * k }, legacyVeil(k));
  }
  return { ...node, children: node.children.map((c) => withLegacyVeil(c, k)) };
}

/** Every terrain, each as an explored hex beside a veiled one. */
function terrainCells(): ArtCell[] {
  return Object.keys(TERRAIN_LOOKS).flatMap((terrain, i) => {
    const col = (i % PER_ROW) * 2;
    const row = Math.floor(i / PER_ROW);
    const at = (c: number) => ({ q: 2 * c, r: -c + 2 * row });
    return [
      { ...at(col), terrain, props: [] },
      { ...at(col + 1), terrain, state: 'unexplored' as const, props: [] },
    ];
  });
}

interface Drawing {
  readonly node: SvgNode;
  readonly width: number;
  readonly height: number;
}

function veilScene(legacy: boolean): Drawing {
  const p = isometric(SIZE);
  const node = renderScene({
    cells: terrainCells(),
    projection: p,
    palette: PALETTE,
    seed: 'veil-review',
    idPrefix: legacy ? 'vb' : 'va',
  });
  const out = legacy ? withLegacyVeil(node, p.k) : node;
  return { node: out, width: Number(out.attrs.width), height: Number(out.attrs.height) };
}

const place = (s: Drawing, x: number, y: number): SvgNode =>
  el('svg', { ...s.node.attrs, x, y, width: s.width, height: s.height }, s.node.children);

function veilSheet(): string {
  const before = veilScene(true);
  const after = veilScene(false);
  const gap = 24;
  const width = Math.max(before.width, after.width) + gap * 2;
  const height = before.height + after.height + gap * 3;
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      place(before, gap, gap),
      el('path', {
        d: `M${gap} ${before.height + gap * 1.5}H${width - gap}`,
        stroke: PALETTE.inkSoft,
        'stroke-width': 1,
      }),
      place(after, gap, before.height + gap * 2),
    ]),
  );
}

/** A map patch with a destination area in it: some hexes seen, some fogged, so the glow shows over both. */
function glowScene(): Drawing {
  const p = isometric(46);
  const cells: ArtCell[] = [];
  for (let q = -4; q <= 4; q += 1) {
    for (let r = -4; r <= 4; r += 1) {
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (d > 4) continue;
      const terrain = d <= 1 ? 'plains' : q + r > 1 ? 'forest' : r < -1 ? 'cliff' : 'plains';
      cells.push({ q, r, terrain, ...(q > 1 ? { state: 'unexplored' as const } : {}) });
    }
  }
  const area: Hex[] = [
    { q: 2, r: -1 },
    { q: 2, r: 0 },
    { q: 3, r: -1 },
    { q: 3, r: -2 },
    { q: 1, r: 0 },
    { q: 1, r: 1 },
  ];
  const scene = renderScene({ cells, projection: p, palette: PALETTE, seed: 'glow-review' });
  const glow = drawDestinationGlow(PALETTE, p, area);
  const node = { ...scene, children: [...scene.children, glow] };
  return { node, width: Number(scene.attrs.width), height: Number(scene.attrs.height) };
}

function glowSheet(): string {
  const s = glowScene();
  const sizes = [20, 32, 56];
  const width = s.width + 140;
  const height = Math.max(s.height, 240);
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      place(s, 0, 0),
      ...sizes.map((size, i) => {
        const badge = drawDestinationBadge(PALETTE, size, `rb${i}`);
        return el('svg', { ...badge.attrs, x: s.width + 40, y: 20 + i * 70 }, badge.children);
      }),
    ]),
  );
}

export function destinationReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  return [
    {
      id: 'veil/before-after',
      group: 'Fog',
      title:
        'The unexplored veil, before (top) and after (bottom): every terrain, explored beside veiled. Darker, thicker stripes, the terrain hue still faint',
      file: 'veil-before-after.svg',
      ...glance,
      svg: veilSheet(),
    },
    {
      id: 'destination/glow',
      group: 'Fog',
      title:
        'The destination’s glow: warm gold-green light rising from each hex of the area, over seen and fogged ground, and the route strip’s badge at three sizes',
      file: 'destination-glow.svg',
      ...glance,
      svg: glowSheet(),
    },
  ];
}
