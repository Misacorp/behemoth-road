/**
 * Review sheets for the content-variety batch: the sunken shrine and undertow on river tiles, an ambush in
 * the forest, a stampede on the plains, river folk in each attitude, and the new icons.
 */
import { drawIcon } from './icons.ts';
import { drawViaMark } from './marks.ts';
import { SPRING } from './palette.ts';
import { isometric } from './projection.ts';
import type { ReviewDraft } from './review.ts';
import { renderScene } from './scene.ts';
import { drawSettlementIcon } from './settlements.ts';
import { drawThreatIcon } from './threats.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ArtCell } from './tile.ts';

const PALETTE = SPRING;
const TOWARD = { q: 0, r: 1 };

function paperSheet(width: number, height: number, children: SvgNode[]): string {
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      ...children,
    ]),
  );
}

function placed(icon: SvgNode, x: number, y: number): SvgNode {
  return el('svg', { ...icon.attrs, x, y }, icon.children);
}

/** Three rows of tiles: features on rivers, then a threat or a people on each fitting terrain. */
function mapSheet(): string {
  const rows: Partial<ArtCell>[][] = [
    [
      { terrain: 'river', feature: { look: 'shrine', state: 'ready' } },
      { terrain: 'river', feature: { look: 'shrine', state: 'spent' } },
      { terrain: 'river', feature: { look: 'undertow' } },
      { terrain: 'river', feature: { look: 'stones' } },
    ],
    [
      { terrain: 'forest', threat: { look: 'ambush', strength: 2, toward: TOWARD } },
      { terrain: 'plains', threat: { look: 'stampede', strength: 3, toward: TOWARD } },
      { terrain: 'plains', settlement: { look: 'river-folk', attitude: 'wary', favour: 1 } },
      { terrain: 'river', settlement: { look: 'river-folk', attitude: 'friendly' } },
    ],
    [
      { terrain: 'plains', settlement: { look: 'river-folk', attitude: 'angry' } },
      { terrain: 'plains', settlement: { look: 'hill-folk', attitude: 'wary', favour: 1 } },
      { terrain: 'desert' },
    ],
  ];
  const cells: ArtCell[] = rows.flatMap((row, r) =>
    row.map((cell, col) => ({ q: 2 * col, r: -col + 2 * r, ...cell }) as ArtCell),
  );
  return toSvgString(
    renderScene({ cells, projection: isometric(60), palette: PALETTE, seed: 'variety' }),
  );
}

/** The new icons: the pearl, the sledge (and done), its path mark, both threats and river folk. */
function iconsSheet(): string {
  const nodes: SvgNode[] = [
    placed(drawIcon('pearl', PALETTE, 72), 24, 24),
    placed(drawIcon('sledge', PALETTE, 72), 120, 24),
    placed(drawIcon('sledge', PALETTE, 72, { done: true }), 216, 24),
    placed(drawViaMark('sand-sledge', PALETTE, 48), 320, 36),
    placed(drawThreatIcon('ambush', PALETTE, 96, { strength: 2 }), 24, 120),
    placed(drawThreatIcon('stampede', PALETTE, 96, { strength: 3 }), 140, 120),
    placed(drawSettlementIcon(PALETTE, 96, { look: 'river-folk', attitude: 'wary' }), 280, 120),
    placed(drawSettlementIcon(PALETTE, 96, { look: 'river-folk', attitude: 'friendly' }), 396, 120),
    placed(drawSettlementIcon(PALETTE, 96, { look: 'river-folk', attitude: 'angry' }), 512, 120),
  ];
  return paperSheet(640, 240, nodes);
}

export function varietyReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  const group = 'More content';
  return [
    {
      id: 'variety/map',
      group,
      title:
        'Sunken shrine (ready, spent), undertow and river stones on rivers; an ambush in the forest, a stampede on the plains; river folk wary, friendly and angry beside hill folk',
      file: 'variety-map.svg',
      ...glance,
      svg: mapSheet(),
    },
    {
      id: 'variety/icons',
      group,
      title:
        'River pearl; sand sledge (and done) with its path mark; ambush and stampede cards; river folk cards in each attitude',
      file: 'variety-icons.svg',
      ...glance,
      svg: iconsSheet(),
    },
  ];
}
