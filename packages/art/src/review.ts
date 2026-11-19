/**
 * The review batch: the items Misa looks at, each as a self-contained SVG. `scripts/review.mjs` writes them
 * with `items.json`. Item ids are stable across batches.
 */
import { ACCENTS, SPRING } from './palette.ts';
import { DIRECTIONS, isometric } from './projection.ts';
import { samplePatch } from './sample.ts';
import { renderScene } from './scene.ts';
import { toSvgString } from './svg.ts';
import { ART_TUNING } from './config.ts';
import { drawCreature, GENTLE_AMBLER } from './creature.ts';
import type { PropDraw } from './props.ts';
import { TERRAIN_LOOKS } from './terrain.ts';
import type { ArtCell } from './tile.ts';

export interface ReviewDraft {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly file: string;
  readonly kind: 'glance' | 'pick';
  readonly pick?: string;
  readonly question?: string;
  readonly svg: string;
}

const SEED = 'style-sample-1';
const PALETTE = SPRING;

/** Cells in rows of `perRow`, one hex apart: index i sits at column i % perRow, row i / perRow. */
function gridCell(i: number, perRow: number): { q: number; r: number } {
  const col = i % perRow;
  const row = Math.floor(i / perRow);
  return { q: 2 * col, r: -col + 2 * row };
}

/** The seven hexes of a creature's footprint around (q, r), as plain ground. */
function footprint(q: number, r: number): ArtCell[] {
  return [{ q: 0, r: 0 }, ...DIRECTIONS].map((d) => ({
    q: q + d.q,
    r: r + d.r,
    terrain: 'plains',
    props: [],
  }));
}

const NORTH = { q: 0, r: -1 };

function mapPatch(): string {
  const { cells, creature, characters } = samplePatch(NORTH);
  return toSvgString(
    renderScene({
      cells,
      creature,
      characters,
      projection: isometric(),
      palette: PALETTE,
      seed: SEED,
    }),
  );
}

function terrainSheet(): string {
  const ids = [...Object.keys(TERRAIN_LOOKS), 'unknown-terrain'];
  const cells: ArtCell[] = ids.map((terrain, i) => ({ ...gridCell(i, 5), terrain }));
  return toSvgString(
    renderScene({ cells, projection: isometric(56), palette: PALETTE, seed: 'terrain-sheet' }),
  );
}

function propsSheet(): string {
  const rows: [string, string][] = [
    ['conifer', 'pines'],
    ['broadleaf', 'forest'],
    ['tuft', 'plains'],
    ['dune', 'desert'],
    ['rock', 'rocks'],
    ['cliff', 'cliff'],
    ['hill', 'hills'],
    ['ruin', 'plains'],
  ];
  const cells: ArtCell[] = [];
  rows.forEach(([kind, terrain], row) => {
    for (let col = 0; col < 4; col += 1) {
      cells.push({
        ...gridCell(row * 4 + col, 4),
        terrain,
        props: [{ kind, dx: 0, dy: 0.1, scale: 1.4 }],
      });
    }
  });
  return toSvgString(
    renderScene({ cells, projection: isometric(56), palette: PALETTE, seed: 'props-sheet' }),
  );
}

/** The creature walking each of the six hex directions, north first, clockwise. */
function headingsSheet(): string {
  const headings = [
    NORTH,
    { q: 1, r: -1 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
  ];
  const centres = headings.map((_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return { q: 4 * col, r: -Math.floor((4 * col) / 2) + 4 * row };
  });
  // Each creature is drawn through a prop override on its footprint's centre, so all six share one scene.
  const overrides: Record<string, PropDraw> = {};
  const cells = centres.flatMap((c, i) => {
    const kind = `creature-${i}`;
    overrides[kind] = (ctx) =>
      drawCreature(
        ctx.palette,
        GENTLE_AMBLER,
        ctx.origin,
        ctx.k * ART_TUNING.hexSize,
        ctx.squash,
        ctx.ink,
        headings[i]!,
      );
    return footprint(c.q, c.r).map((cell) =>
      cell.q === c.q && cell.r === c.r ? { ...cell, props: [{ kind, dx: 0, dy: 0 }] } : cell,
    );
  });
  return toSvgString(
    renderScene({
      cells,
      projection: isometric(50),
      palette: PALETTE,
      seed: 'headings',
      overrides,
      occupied: centres.flatMap((c) => footprint(c.q, c.r)),
    }),
  );
}

function charactersSheet(): string {
  const cells: ArtCell[] = ACCENTS.map((_, i) => ({
    ...gridCell(i, 2),
    terrain: 'plains',
    props: [],
  }));
  const characters = ACCENTS.map((accent, i) => ({ id: `c-${accent}`, ...gridCell(i, 2), accent }));
  return toSvgString(
    renderScene({
      cells,
      characters,
      projection: isometric(110),
      palette: PALETTE,
      seed: 'characters-sheet',
    }),
  );
}

function fogSheet(): string {
  const cells: ArtCell[] = [
    { ...gridCell(0, 4), terrain: 'plains', state: 'unseen' },
    { ...gridCell(1, 4), terrain: 'plains', state: 'fading' },
    { ...gridCell(2, 4), terrain: 'plains', state: 'lost' },
    { ...gridCell(3, 4), terrain: 'plains', hint: true, props: [] },
  ];
  return toSvgString(
    renderScene({ cells, projection: isometric(72), palette: PALETTE, seed: 'fog-sheet' }),
  );
}

export function buildReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  return [
    {
      id: 'map/patch',
      group: 'Map',
      title: 'The map, Spring at tilt 0.8',
      file: 'map-patch.svg',
      ...glance,
      svg: mapPatch(),
    },
    {
      id: 'creature/headings',
      group: 'Creature',
      title: 'Walking the six directions',
      file: 'creature-headings.svg',
      ...glance,
      svg: headingsSheet(),
    },
    {
      id: 'sheet/terrain',
      group: 'Sheets',
      title: 'Terrain tiles',
      file: 'sheet-terrain.svg',
      ...glance,
      svg: terrainSheet(),
    },
    {
      id: 'sheet/props',
      group: 'Sheets',
      title: 'Props',
      file: 'sheet-props.svg',
      ...glance,
      svg: propsSheet(),
    },
    {
      id: 'sheet/characters',
      group: 'Sheets',
      title: 'Character standees',
      file: 'sheet-characters.svg',
      ...glance,
      svg: charactersSheet(),
    },
    {
      id: 'sheet/fog',
      group: 'Sheets',
      title: 'Unseen, fading, lost, hint',
      file: 'sheet-fog.svg',
      ...glance,
      svg: fogSheet(),
    },
  ];
}

export interface IndexedItem {
  readonly id: string;
  readonly version: string;
}

/** The batch name: same date keeps its number when nothing changed, otherwise counts up; a new date starts at 1. */
export function nextBatch(
  previous: { readonly batch?: unknown; readonly items?: readonly IndexedItem[] } | undefined,
  items: readonly IndexedItem[],
  today: string,
): string {
  if (!previous || typeof previous.batch !== 'string' || !previous.batch.startsWith(`${today}-`)) {
    return `${today}-1`;
  }
  const n = Number(previous.batch.slice(today.length + 1)) || 0;
  const before = new Map((previous.items ?? []).map((i) => [i.id, i.version]));
  const same = before.size === items.length && items.every((i) => before.get(i.id) === i.version);
  return `${today}-${same ? n : n + 1}`;
}
