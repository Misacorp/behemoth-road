/**
 * The review batch: the items Misa looks at, each as a self-contained SVG. `scripts/review.mjs` writes them
 * with `items.json`. Item ids are stable across batches.
 */
import { ACCENTS, MIST, PALETTES, type Palette } from './palette.ts';
import { isometric, topDown, type Projection } from './projection.ts';
import { samplePatch } from './sample.ts';
import { renderScene } from './scene.ts';
import { toSvgString } from './svg.ts';
import { GENTLE_AMBLER, type CreatureFacing } from './creature.ts';
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

function patch(palette: Palette, projection: Projection, facing: CreatureFacing = 'right'): string {
  const { cells, creature, characters } = samplePatch(facing);
  return toSvgString(renderScene({ cells, creature, characters, projection, palette, seed: SEED }));
}

/** Cells in rows of `perRow`, one hex apart: index i sits at column i % perRow, row i / perRow. */
function gridCell(i: number, perRow: number): { q: number; r: number } {
  const col = i % perRow;
  const row = Math.floor(i / perRow);
  return { q: 2 * col, r: -col + 2 * row };
}

function terrainSheet(): string {
  const ids = [...Object.keys(TERRAIN_LOOKS), 'unknown-terrain'];
  const cells: ArtCell[] = ids.map((terrain, i) => ({ ...gridCell(i, 5), terrain }));
  return toSvgString(
    renderScene({ cells, projection: isometric(56), palette: MIST, seed: 'terrain-sheet' }),
  );
}

function propsSheet(): string {
  const rows: [string, string][] = [
    ['conifer', 'pines'],
    ['broadleaf', 'forest'],
    ['tuft', 'meadow'],
    ['dune', 'desert'],
    ['rock', 'rocks'],
    ['cliff', 'cliff'],
    ['hill', 'hills'],
    ['ruin', 'meadow'],
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
    renderScene({ cells, projection: isometric(56), palette: MIST, seed: 'props-sheet' }),
  );
}

function creatureSheet(facing: CreatureFacing): string {
  const cells: ArtCell[] = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ].map((h) => ({ ...h, terrain: 'meadow', props: [] }));
  return toSvgString(
    renderScene({
      cells,
      creature: { q: 0, r: 0, facing, look: GENTLE_AMBLER },
      projection: isometric(140),
      palette: MIST,
      seed: 'creature-sheet',
    }),
  );
}

function charactersSheet(): string {
  const cells: ArtCell[] = ACCENTS.map((_, i) => ({
    ...gridCell(i, 2),
    terrain: 'meadow',
    props: [],
  }));
  const characters = ACCENTS.map((accent, i) => ({ id: `c-${accent}`, ...gridCell(i, 2), accent }));
  return toSvgString(
    renderScene({
      cells,
      characters,
      projection: isometric(110),
      palette: MIST,
      seed: 'characters-sheet',
    }),
  );
}

function fogSheet(): string {
  const cells: ArtCell[] = [
    { ...gridCell(0, 4), terrain: 'meadow', state: 'unseen' },
    { ...gridCell(1, 4), terrain: 'meadow', state: 'fading' },
    { ...gridCell(2, 4), terrain: 'meadow', state: 'lost' },
    { ...gridCell(3, 4), terrain: 'meadow', hint: true, props: [] },
  ];
  return toSvgString(
    renderScene({ cells, projection: isometric(72), palette: MIST, seed: 'fog-sheet' }),
  );
}

export function buildReviewItems(): ReviewDraft[] {
  const palettePick = {
    kind: 'pick',
    pick: 'style-palette',
    question: 'Which palette should the game use?',
  } as const;
  const tiltPick = {
    kind: 'pick',
    pick: 'style-tilt',
    question: 'How strong should the tilt be?',
  } as const;
  const facingPick = {
    kind: 'pick',
    pick: 'creature-facing',
    question: 'Which way should the creature face when it walks north?',
  } as const;
  return [
    ...PALETTES.map((palette): ReviewDraft => ({
      id: `style/${palette.id}`,
      group: 'Style sample',
      title: palette.name,
      file: `style-${palette.id}.svg`,
      ...palettePick,
      svg: patch(palette, isometric()),
    })),
    {
      id: 'tilt/0-5',
      group: 'Tilt',
      title: 'Tilt 0.5',
      file: 'tilt-0-5.svg',
      ...tiltPick,
      svg: patch(MIST, isometric(64, 0.5)),
    },
    {
      id: 'tilt/0-6',
      group: 'Tilt',
      title: 'Tilt 0.6',
      file: 'tilt-0-6.svg',
      ...tiltPick,
      svg: patch(MIST, isometric(64, 0.6)),
    },
    {
      id: 'tilt/top',
      group: 'Tilt',
      title: 'Top-down',
      file: 'tilt-top.svg',
      ...tiltPick,
      svg: patch(MIST, topDown(64)),
    },
    {
      id: 'facing/side',
      group: 'Creature facing',
      title: 'Side view',
      file: 'facing-side.svg',
      ...facingPick,
      svg: patch(MIST, isometric(), 'right'),
    },
    {
      id: 'facing/away',
      group: 'Creature facing',
      title: 'From behind',
      file: 'facing-away.svg',
      ...facingPick,
      svg: patch(MIST, isometric(), 'away'),
    },
    {
      id: 'sheet/terrain',
      group: 'Sheets',
      title: 'Terrain tiles',
      file: 'sheet-terrain.svg',
      kind: 'glance',
      svg: terrainSheet(),
    },
    {
      id: 'sheet/props',
      group: 'Sheets',
      title: 'Props',
      file: 'sheet-props.svg',
      kind: 'glance',
      svg: propsSheet(),
    },
    {
      id: 'creature/gentle-ambler',
      group: 'Sheets',
      title: 'The first creature',
      file: 'creature-gentle-ambler.svg',
      kind: 'glance',
      svg: creatureSheet('right'),
    },
    {
      id: 'creature/gentle-ambler-away',
      group: 'Sheets',
      title: 'The first creature from behind',
      file: 'creature-gentle-ambler-away.svg',
      kind: 'glance',
      svg: creatureSheet('away'),
    },
    {
      id: 'sheet/characters',
      group: 'Sheets',
      title: 'Character standees',
      file: 'sheet-characters.svg',
      kind: 'glance',
      svg: charactersSheet(),
    },
    {
      id: 'sheet/fog',
      group: 'Sheets',
      title: 'Unseen, fading, lost, hint',
      file: 'sheet-fog.svg',
      kind: 'glance',
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
