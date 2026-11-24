/**
 * Review sheets for the terrain colours: the six terrains side by side, a map patch with every overlay
 * (veil, fading, lost, trodden ground, creature, characters, a threat, a find, a glint), and the same two
 * under a protan and a deutan simulation.
 */
import { VISION, visionFilterValues, type Vision } from './colourblind.ts';
import { GENTLE_AMBLER } from './creature.ts';
import { SPRING } from './palette.ts';
import { DIRECTIONS, isometric } from './projection.ts';
import type { ReviewDraft } from './review.ts';
import { renderScene } from './scene.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import type { ArtCell } from './tile.ts';

const PALETTE = SPRING;

/** The six terrains, each with its own prop or texture. */
export const SIX_TERRAINS = ['plains', 'forest', 'desert', 'cliff', 'lake', 'swamp'] as const;

function sixCells(): ArtCell[] {
  return SIX_TERRAINS.map((terrain, i) => ({
    q: (i % 3) * 2 - Math.floor(i / 3),
    r: Math.floor(i / 3) * 2 - (i % 3),
    terrain,
  }));
}

function sixScene(size: number, prefix: string): SvgNode {
  return renderScene({
    cells: sixCells(),
    projection: isometric(size),
    palette: PALETTE,
    seed: 'terrain-six',
    idPrefix: prefix,
  });
}

/** A hex patch: every terrain, with the overlays that must stay legible over each. */
function patchCells(): ArtCell[] {
  const terrains = ['plains', 'forest', 'swamp', 'desert', 'cliff', 'plains', 'lake'] as const;
  const out: ArtCell[] = [];
  for (let q = -3; q <= 3; q += 1) {
    for (let r = -3; r <= 3; r += 1) {
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (d > 3) continue;
      const terrain = d <= 1 ? 'plains' : terrains[(((q * 3 + r * 5) % 7) + 7) % 7]!;
      const cell: ArtCell = { q, r, terrain };
      if (d === 3 && q + r > 0) out.push({ ...cell, state: 'unexplored' });
      else if (d === 3 && q + r < -1) out.push({ ...cell, state: 'lost' });
      else if (d === 3) out.push({ ...cell, state: 'unseen' });
      else out.push(cell);
    }
  }
  return out;
}

function patchScene(size: number, prefix: string): SvgNode {
  const cells = patchCells().map((c): ArtCell => {
    if (c.q === 2 && c.r === 0) return { ...c, threat: { look: 'ambush', strength: 2 } };
    if (c.q === -2 && c.r === 0) return { ...c, feature: { look: 'ore', state: 'ready' as const } };
    if (c.q === 0 && c.r === 2) return { ...c, hint: true };
    return c;
  });
  return renderScene({
    cells,
    creature: { q: 0, r: 0, heading: DIRECTIONS[0]!, look: GENTLE_AMBLER, defenders: 1 },
    characters: [
      { id: 'a', q: 2, r: -2, accent: 'rose' },
      { id: 'b', q: -2, r: 2, accent: 'teal' },
    ],
    projection: isometric(size),
    palette: PALETTE,
    seed: 'terrain-patch',
    idPrefix: prefix,
  });
}

function dimensions(scene: SvgNode): { w: number; h: number } {
  return { w: Number(scene.attrs.width), h: Number(scene.attrs.height) };
}

/** A scene placed in a sheet, optionally seen through a colour-vision simulation. */
function panel(scene: SvgNode, x: number, y: number, vision?: Vision): SvgNode {
  const { w, h } = dimensions(scene);
  const attrs = { x, y, width: w, height: h, viewBox: scene.attrs.viewBox! };
  if (!vision) return el('svg', attrs, scene.children);
  const id = `vision-${vision}-${x}-${y}`;
  return el('svg', attrs, [
    el('defs', {}, [
      el('filter', { id, 'color-interpolation-filters': 'linearRGB' }, [
        el('feColorMatrix', { type: 'matrix', values: visionFilterValues(vision) }),
      ]),
    ]),
    el('g', { filter: `url(#${id})` }, scene.children),
  ]);
}

function sheet(width: number, height: number, children: SvgNode[]): string {
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      ...children,
    ]),
  );
}

function sixSheet(): string {
  const scene = sixScene(84, 'six');
  const { w, h } = dimensions(scene);
  return sheet(w, h, [panel(scene, 0, 0)]);
}

function patchSheet(): string {
  const scene = patchScene(64, 'patch');
  const { w, h } = dimensions(scene);
  return sheet(w, h, [panel(scene, 0, 0)]);
}

/** The six terrains: as seen normally, protan, deutan, one under the other. */
function visionSheet(): string {
  const scene = sixScene(84, 'cb0');
  const { w, h } = dimensions(scene);
  const panels = [
    panel(scene, 0, 0),
    ...VISION.map((v, i) => panel(sixScene(84, `cb${i + 1}`), 0, (i + 1) * h, v)),
  ];
  return sheet(w, h * 3, panels);
}

export function terrainReviewItems(): ReviewDraft[] {
  const group = 'Terrain colours';
  const glance = { kind: 'glance' } as const;
  return [
    {
      id: 'terrain/six',
      group,
      title:
        'Six terrains, each with its own base colour and prop: plains, forest, desert, cliffs, lake, swamp',
      file: 'terrain-six.svg',
      ...glance,
      svg: sixSheet(),
    },
    {
      id: 'terrain/patch',
      group,
      title:
        'A map patch over every terrain: the creature on trodden ground, characters, a threat, a find, a glint, fading, lost and unexplored ground',
      file: 'terrain-patch.svg',
      ...glance,
      svg: patchSheet(),
    },
    {
      id: 'terrain/colourblind',
      group,
      title: 'The six terrains as seen normally, with protan vision and with deutan vision',
      file: 'terrain-colourblind.svg',
      ...glance,
      svg: visionSheet(),
    },
  ];
}
