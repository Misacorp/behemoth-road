/**
 * The world-art review sheets (r11): traces over every ground colour, the standing stones and the Greyfold
 * mark, the sixteen story vignettes, and the gate signs.
 */
import type { Material, Palette } from './palette.ts';
import { SPRING } from './palette.ts';
import { hexCorners, isometric } from './projection.ts';
import type { ReviewDraft } from './review.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import {
  drawGateSign,
  drawStoryVignette,
  GATE_SIGN_KINDS,
  STORY_VIGNETTE_IDS,
} from './story-art.ts';
import { drawTrace, TRACE_KINDS } from './traces.ts';
import { drawRouteDestination, drawStandingStone } from './waymarks.ts';

const PALETTE: Palette = SPRING;

function sheet(width: number, height: number, children: SvgNode[]): string {
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      ...children,
    ]),
  );
}

function at(node: SvgNode, x: number, y: number): SvgNode {
  return el('svg', { ...node.attrs, x, y }, node.children);
}

const GROUNDS: readonly { name: string; material: Material; veil?: boolean }[] = [
  { name: 'plains', material: 'plain' },
  { name: 'forest', material: 'wood' },
  { name: 'desert', material: 'dune' },
  { name: 'cliffs', material: 'crag' },
  { name: 'lake', material: 'water' },
  { name: 'swamp', material: 'mire' },
  { name: 'hills', material: 'upland' },
  { name: 'trodden', material: 'trodden' },
  { name: 'veiled forest', material: 'wood', veil: true },
];

/** Every trace on every ground (one row each), with a rider-height reference stone beside the first row. */
function tracesSheet(): string {
  const size = 44;
  const p = isometric(size);
  const cw = size * 2 + 6;
  const rh = size * 1.6 + 10;
  const nodes: SvgNode[] = [];
  TRACE_KINDS.forEach((kind, row) => {
    GROUNDS.forEach((g, col) => {
      const c = { x: col * cw + size + 4, y: row * rh + size * 0.9 + 6 };
      const corners = hexCorners(p, c);
      const d = `M${corners.map((q) => `${q.x} ${q.y}`).join('L')}Z`;
      nodes.push(
        el('path', {
          d,
          fill: PALETTE.ramps[g.material].base,
          stroke: PALETTE.ink,
          'stroke-width': 0.8,
        }),
      );
      if (g.veil) nodes.push(el('path', { d, fill: PALETTE.paper, opacity: 0.55 }));
      const trace = drawTrace(PALETTE, kind, {
        origin: c,
        k: size / 64,
        squash: p.squash,
        seed: col,
      });
      nodes.push(el('g', {}, trace.nodes));
    });
  });
  return sheet(GROUNDS.length * cw + 8, TRACE_KINDS.length * rh + 8, nodes);
}

function waymarksSheet(): string {
  const k = 1.1;
  const nodes: SvgNode[] = [0, 1, 2, 3].map((ticks) =>
    el(
      'g',
      {},
      drawStandingStone(PALETTE, { origin: { x: 60 + ticks * 110, y: 100 }, k, seed: ticks, ticks })
        .nodes,
    ),
  );
  nodes.push(at(drawRouteDestination(PALETTE, 96), 480, 30));
  nodes.push(at(drawRouteDestination(PALETTE, 24), 600, 66));
  return sheet(660, 120, nodes);
}

function vignettesSheet(): string {
  const w = 192;
  const h = 128;
  const nodes = STORY_VIGNETTE_IDS.map((id, i) =>
    at(drawStoryVignette(PALETTE, id, w), 8 + (i % 4) * (w + 8), 8 + Math.floor(i / 4) * (h + 8)),
  );
  return sheet(8 + 4 * (w + 8), 8 + 4 * (h + 8), nodes);
}

function gateSignsSheet(): string {
  return sheet(
    600,
    120,
    GATE_SIGN_KINDS.map((kind, i) => at(drawGateSign(PALETTE, kind, 80), 220 + i * 100, 20)),
  );
}

export function worldReviewItems(): ReviewDraft[] {
  const group = 'World art';
  const glance = { kind: 'glance' } as const;
  return [
    {
      id: 'world/traces',
      group,
      title:
        'Traces over every ground: fire scar, green trail, cairn, broken chain, open gate (plains, forest, desert, cliffs, lake, swamp, hills, trodden, veiled)',
      file: 'world-traces.svg',
      ...glance,
      svg: tracesSheet(),
    },
    {
      id: 'world/waymarks',
      group,
      title: 'The standing stone (bare, then one, two and three marks) and the Greyfold route mark',
      file: 'world-waymarks.svg',
      ...glance,
      svg: waymarksSheet(),
    },
    {
      id: 'world/story-cards',
      group,
      title: 'Story card vignettes: twelve route beats and four endings',
      file: 'world-story-cards.svg',
      ...glance,
      svg: vignettesSheet(),
    },
    {
      id: 'world/gate-signs',
      group,
      title:
        'Gate signs: a bell with its clapper tied (hill folk), a pearl on a stone (river folk)',
      file: 'world-gate-signs.svg',
      ...glance,
      svg: gateSignsSheet(),
    },
  ];
}
