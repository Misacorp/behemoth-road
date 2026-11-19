/**
 * The review batch: the items Misa looks at, each as a self-contained SVG. `scripts/review.mjs` writes them
 * with `items.json`. Item ids are stable across batches.
 */
import { ACCENTS, SPRING } from './palette.ts';
import { DIRECTIONS, isometric } from './projection.ts';
import { samplePatch } from './sample.ts';
import { renderScene } from './scene.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import { assignLooks, drawCharacter } from './character.ts';
import { drawIcon, ROLE_IDS, type EmblemFrame } from './icons.ts';
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

/** A plain paper sheet of `width` × `height` holding `children`, no filters. */
function paperSheet(width: number, height: number, children: SvgNode[]): string {
  return toSvgString(
    el('svg', { viewBox: `0 0 ${width} ${height}`, width, height }, [
      el('rect', { x: 0, y: 0, width, height, fill: PALETTE.paper }),
      ...children,
    ]),
  );
}

/** An icon placed on a sheet: a nested <svg> at (x, y). */
function placed(icon: SvgNode, x: number, y: number): SvgNode {
  return el('svg', { ...icon.attrs, x, y }, icon.children);
}

/** The six role emblems in one frame style, at 96, 48 and 32 px. */
function emblemSheet(frame: EmblemFrame): string {
  const rows: SvgNode[] = [];
  const sizes = [96, 48, 32];
  let y = 24;
  for (const size of sizes) {
    ROLE_IDS.forEach((role, i) => {
      const cell = 116;
      rows.push(
        placed(
          drawIcon(`role:${role}`, PALETTE, size, { frame }),
          24 + i * cell + (cell - 8 - size) / 2,
          y,
        ),
      );
    });
    y += size + 24;
  }
  return paperSheet(24 * 2 + 6 * 116 - 8, y, rows);
}

/** Trait and quirk icon keys in content order (`packages/core` content; the web tests check they match). */
const TRAIT_ICONS = [
  'boot',
  'sun',
  'wave',
  'leaf',
  'eye',
  'moon',
  'pack',
  'hand',
  'sprig',
  'scroll',
  'quill',
  'paw',
];
const QUIRK_ICONS = [
  'feet',
  'feather',
  'owl',
  'stone',
  'key',
  'charm',
  'jar',
  'horn',
  'drop',
  'cloud',
  'spoon',
  'cane',
];

/** Every icon: the role emblems, the traits, the quirks (on their split tile), then the neutral mark. */
function iconSheet(): string {
  const rows: { id: string; tile?: 'quirk' }[][] = [
    ROLE_IDS.map((r) => ({ id: `role:${r}` })),
    TRAIT_ICONS.slice(0, 6).map((id) => ({ id })),
    TRAIT_ICONS.slice(6).map((id) => ({ id })),
    QUIRK_ICONS.slice(0, 6).map((id) => ({ id, tile: 'quirk' as const })),
    QUIRK_ICONS.slice(6).map((id) => ({ id, tile: 'quirk' as const })),
    [{ id: 'unknown-icon' }],
  ];
  const cell = 100;
  const nodes = rows.flatMap((row, r) =>
    row.map(({ id, tile }, c) =>
      placed(
        drawIcon(id, PALETTE, 72, tile ? { tile } : {}),
        28 + c * cell,
        24 + r * cell + (r > 0 ? 12 : 0) + (r > 2 ? 12 : 0),
      ),
    ),
  );
  return paperSheet(28 * 2 + 6 * cell - 20, 24 * 2 + rows.length * cell + 4, nodes);
}

const LINEUP_IDS = Array.from({ length: 15 }, (_, i) => `character-${i + 1}`);

/** Fifteen rolled characters side by side, as the map draws them, larger. */
function lineupSheet(): string {
  const looks = assignLooks(LINEUP_IDS);
  const perRow = 8;
  const cell = 96;
  const nodes = looks.flatMap(
    ({ accent, look }, i) =>
      drawCharacter(
        PALETTE,
        accent,
        { x: 24 + (i % perRow) * cell + cell / 2, y: 150 + Math.floor(i / perRow) * 150 },
        150,
        ART_TUNING.tilt,
        ART_TUNING.inkWidth * 1.6,
        look,
      ).nodes,
  );
  return paperSheet(24 * 2 + perRow * cell, 340, nodes);
}

/** The same fifteen riding the creature, at the map's size. */
function ridersSheet(): string {
  const looks = assignLooks(LINEUP_IDS);
  const cells: ArtCell[] = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      if (Math.abs(q) + Math.abs(r) + Math.abs(q + r) <= 4)
        cells.push({ q, r, terrain: 'plains', props: [] });
    }
  }
  return toSvgString(
    renderScene({
      cells,
      creature: { q: 0, r: 0, heading: NORTH, look: GENTLE_AMBLER },
      characters: looks.map(({ accent, look }, i) => ({
        id: LINEUP_IDS[i]!,
        q: 0,
        r: 0,
        accent,
        look,
      })),
      projection: isometric(96),
      palette: PALETTE,
      seed: 'riders',
    }),
  );
}

export function buildReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  const framePick = {
    kind: 'pick',
    pick: 'emblem-frame',
    question: 'Which frame should the role emblems share?',
  } as const;
  return [
    {
      id: 'emblems/roundel',
      group: 'Role emblems',
      title: 'Round frame',
      file: 'emblems-roundel.svg',
      ...framePick,
      svg: emblemSheet('roundel'),
    },
    {
      id: 'emblems/shield',
      group: 'Role emblems',
      title: 'Shield frame',
      file: 'emblems-shield.svg',
      ...framePick,
      svg: emblemSheet('shield'),
    },
    {
      id: 'icons/sheet',
      group: 'Icons',
      title: 'Every icon, and the fallback',
      file: 'icons-sheet.svg',
      ...glance,
      svg: iconSheet(),
    },
    {
      id: 'characters/lineup',
      group: 'Characters',
      title: 'Fifteen rolled characters',
      file: 'characters-lineup.svg',
      ...glance,
      svg: lineupSheet(),
    },
    {
      id: 'characters/riders',
      group: 'Characters',
      title: 'Fifteen riders on the creature',
      file: 'characters-riders.svg',
      ...glance,
      svg: ridersSheet(),
    },
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
