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
import { drawIcon, ITEM_MOTIFS, MATERIAL_MOTIFS, ROLE_IDS, type EmblemFrame } from './icons.ts';
import { drawMoment, drawStayMark, drawStepHint, drawViaMark, MOMENT_KINDS } from './marks.ts';
import { drawAppetiteBadge } from './signs.ts';
import type { CreatureAppetite } from './creature.ts';
import { drawPackIcon, drawStoresIcon, drawUnlockSeal, drawWorkBar } from './team-marks.ts';
import { ART_TUNING } from './config.ts';
import { drawCreature, GENTLE_AMBLER, type CreatureMood } from './creature.ts';
import type { PropDraw } from './props.ts';
import { TERRAIN_LOOKS } from './terrain.ts';
import type { ArtCell } from './tile.ts';
import { seasonReviewItems } from './review-season.ts';

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

/** Every feature on a fitting tile: nodes as found and used up, sites sealed and spent, revealed traps. */
function featuresSheet(): string {
  const rows: [string, string, 'ready' | 'depleted' | 'spent'][][] = [
    [
      ['ore', 'desert', 'ready'],
      ['stones', 'river', 'ready'],
      ['logs', 'forest', 'ready'],
      ['no-such-feature', 'plains', 'ready'],
    ],
    [
      ['ore', 'desert', 'depleted'],
      ['stones', 'river', 'depleted'],
      ['logs', 'forest', 'depleted'],
    ],
    [
      ['tomb', 'plains', 'ready'],
      ['deep-tomb', 'plains', 'ready'],
      ['snare', 'plains', 'ready'],
      ['pitfall', 'plains', 'ready'],
    ],
    [
      ['tomb', 'plains', 'spent'],
      ['deep-tomb', 'plains', 'spent'],
    ],
  ];
  const cells: ArtCell[] = rows.flatMap((row, r) =>
    row.map(([look, terrain, state], col) => ({
      ...gridCell(r * 4 + col, 4),
      terrain,
      feature: { look, state },
    })),
  );
  return toSvgString(
    renderScene({ cells, projection: isometric(60), palette: PALETTE, seed: 'features' }),
  );
}

/** The glint on a few tiles, next to the same tiles without it. */
function glintSheet(): string {
  const terrains = ['plains', 'forest', 'desert', 'hills'];
  const cells: ArtCell[] = terrains.flatMap((terrain, i) => [
    { ...gridCell(i, 4), terrain },
    { ...gridCell(i + 4, 4), terrain, hint: true },
  ]);
  return toSvgString(
    renderScene({ cells, projection: isometric(66), palette: PALETTE, seed: 'glints' }),
  );
}

/** The moments as their finished frames, large, and the `via` marks at three sizes. */
function marksSheet(): string {
  // The Milestone 3 moments; the care moments are on their own sheet.
  const nodes: SvgNode[] = MOMENT_KINDS.slice(0, 4).map((kind, i) =>
    placed(drawMoment(kind, PALETTE, 130), 24 + i * 165, 24),
  );
  [24, 36, 48].forEach((size, i) =>
    nodes.push(placed(drawViaMark('grappling-hook', PALETTE, size), 60 + i * 90, 190)),
  );
  nodes.push(placed(drawViaMark('climbing-spikes', PALETTE, 36), 340, 196));
  nodes.push(placed(drawViaMark('unknown-via', PALETTE, 36), 430, 196));
  return paperSheet(690, 270, nodes);
}

/** Explored ground, the unexplored veil, blank paper and fading tiles, side by side, on two terrains. */
function veilSheet(): string {
  const states = ['seen', 'unexplored', 'unseen', 'fading'] as const;
  const cells: ArtCell[] = (['forest', 'desert'] as const).flatMap((terrain, row) =>
    states.map((state, col) => ({ ...gridCell(row * 4 + col, 4), terrain, state })),
  );
  return toSvgString(
    renderScene({ cells, projection: isometric(66), palette: PALETTE, seed: 'veil' }),
  );
}

/** A pack from empty to full, the stores, the unlocks (done with a seal) and work bars. */
function teamSheet(): string {
  const nodes: SvgNode[] = [];
  for (let n = 0; n <= 6; n += 1) nodes.push(placed(drawPackIcon(PALETTE, 64, n), 24 + n * 90, 24));
  nodes.push(placed(drawStoresIcon(PALETTE, 72), 24, 120));
  (['hook', 'lantern', 'spikes'] as const).forEach((key, i) => {
    nodes.push(placed(drawIcon(key, PALETTE, 72), 140 + i * 180, 120));
    nodes.push(placed(drawIcon(key, PALETTE, 72, { done: true }), 230 + i * 180, 120));
  });
  [0, 0.25, 0.5, 1].forEach((f, i) =>
    nodes.push(placed(drawWorkBar(PALETTE, 150, f, [4, 3, 6, 4][i]), 24 + i * 165, 230)),
  );
  nodes.push(placed(drawUnlockSeal(PALETTE, 40), 24, 260));
  return paperSheet(700, 320, nodes);
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
  'boulder',
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
    [...Object.keys(MATERIAL_MOTIFS), ...Object.keys(ITEM_MOTIFS)]
      .slice(0, 6)
      .map((id) => ({ id })),
    [...Object.keys(MATERIAL_MOTIFS), ...Object.keys(ITEM_MOTIFS)].slice(6).map((id) => ({ id })),
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
/** Look seeds for the line-up, as content would give them. */
const LINEUP_SEEDS = LINEUP_IDS.map((_, i) => 1000 + i * 7919);

/** Fifteen rolled characters side by side, as the map draws them, larger. */
function lineupSheet(): string {
  const looks = assignLooks(LINEUP_SEEDS);
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
  const looks = assignLooks(LINEUP_SEEDS);
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

interface CreatureSpot {
  readonly heading: { q: number; r: number };
  readonly mood: CreatureMood;
  /** Fires on hexes, as offsets from the creature's centre. */
  readonly fires?: readonly { q: number; r: number }[];
}

/**
 * Several creatures in one scene, `perRow` to a row, each drawn through a prop override on its footprint's
 * centre (as the headings sheet does), with fires on plain ground around them.
 */
function creatureSheet(
  spots: readonly CreatureSpot[],
  perRow: number,
  hexSize: number,
  seed: string,
  gap = 4,
  effects: 'full' | 'lite' = 'full',
): string {
  const centres = spots.map((_, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    return { q: gap * col, r: -Math.floor((gap * col) / 2) + gap * row };
  });
  const overrides: Record<string, PropDraw> = {};
  const cells: ArtCell[] = [];
  const seen = new Set<string>();
  const add = (cell: ArtCell): void => {
    const key = `${cell.q},${cell.r}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push(cell);
  };
  spots.forEach((spot, i) => {
    const c = centres[i]!;
    const kind = `creature-${i}`;
    overrides[kind] = (ctx) =>
      drawCreature(
        ctx.palette,
        GENTLE_AMBLER,
        ctx.origin,
        ctx.k * ART_TUNING.hexSize,
        ctx.squash,
        ctx.ink,
        spot.heading,
        0,
        spot.mood,
      );
    for (const f of spot.fires ?? [])
      add({ q: c.q + f.q, r: c.r + f.r, terrain: 'plains', props: [], fire: true });
    for (const cell of footprint(c.q, c.r))
      add(cell.q === c.q && cell.r === c.r ? { ...cell, props: [{ kind, dx: 0, dy: 0 }] } : cell);
  });
  return toSvgString(
    renderScene({
      cells,
      projection: isometric(hexSize),
      palette: PALETTE,
      seed,
      overrides,
      effects,
      occupied: centres.flatMap((c) => footprint(c.q, c.r)),
    }),
  );
}

const EAST = { q: 1, r: 0 };
const SOUTH = { q: 0, r: 1 };

/** Calm, then the appetite at levels 1 to 3, then the faint version others see (levels 2 and 3). */
function appetiteSheet(kind: 'underfed' | 'overfed'): string {
  const moods: CreatureMood[] = [
    {},
    { appetite: { kind, level: 1 } },
    { appetite: { kind, level: 2 } },
    { appetite: { kind, level: 3 } },
    { appetite: { kind, level: 2, faint: true } },
    { appetite: { kind, level: 3, faint: true } },
  ];
  return creatureSheet(
    moods.map((mood) => ({ heading: EAST, mood })),
    3,
    44,
    `appetite-${kind}`,
  );
}

/** A fire two hexes off and the keeper's cue for it: drawn to it, shying from it, unmoved; then two at once. */
function cuesSheet(effects: 'full' | 'lite' = 'full'): string {
  const ahead = { q: 2, r: 1 };
  const side = { q: -1, r: 3 };
  return creatureSheet(
    [
      { heading: EAST, fires: [ahead], mood: { cues: [{ reaction: 'toward', offset: ahead }] } },
      { heading: EAST, fires: [ahead], mood: { cues: [{ reaction: 'away', offset: ahead }] } },
      { heading: EAST, fires: [ahead], mood: { cues: [{ reaction: 'unmoved', offset: ahead }] } },
      {
        heading: SOUTH,
        fires: [ahead, side],
        mood: {
          cues: [
            { reaction: 'toward', offset: side },
            { reaction: 'away', offset: ahead },
          ],
        },
      },
    ],
    2,
    50,
    `cues-${effects}`,
    5,
    effects,
  );
}

/** Lying down while it lingers, three ways round, and lying down overfed. */
function lingerSheet(): string {
  return creatureSheet(
    [
      { heading: SOUTH, mood: { pose: 'lying' } },
      { heading: EAST, mood: { pose: 'lying' } },
      { heading: { q: -1, r: 0 }, mood: { pose: 'lying' } },
      { heading: SOUTH, mood: {} },
      { heading: EAST, mood: {} },
      { heading: EAST, mood: { pose: 'lying', appetite: { kind: 'overfed', level: 2 } } },
    ],
    3,
    44,
    'linger',
  );
}

/** Fires on four terrains and under the veil; berry bushes as found and picked bare; a fire beside them. */
function careTilesSheet(): string {
  const rows: ArtCell[][] = [
    [
      { q: 0, r: 0, terrain: 'plains', fire: true },
      { q: 0, r: 0, terrain: 'forest', fire: true },
      { q: 0, r: 0, terrain: 'desert', fire: true },
      { q: 0, r: 0, terrain: 'plains', state: 'unexplored', fire: true },
    ],
    [
      { q: 0, r: 0, terrain: 'forest', feature: { look: 'berries' } },
      { q: 0, r: 0, terrain: 'plains', feature: { look: 'berries' } },
      { q: 0, r: 0, terrain: 'forest', feature: { look: 'berries', state: 'depleted' } },
      { q: 0, r: 0, terrain: 'plains', feature: { look: 'berries' }, fire: true },
    ],
  ];
  const cells = rows.flatMap((row, r) =>
    row.map((cell, col) => ({ ...cell, ...gridCell(r * 4 + col, 4) })),
  );
  return toSvgString(
    renderScene({ cells, projection: isometric(66), palette: PALETTE, seed: 'care-tiles' }),
  );
}

/** The forage icon and the three action icons at 72, 48 and 32 px; the stay hint; the three moments. */
/** Appetite at about the phone's game zoom (a hex about 34 px): calm and underfed, overfed, then the faint signs. */
function appetitePhoneSheet(): string {
  const a = (kind: 'underfed' | 'overfed', level: 1 | 2 | 3, faint = false): CreatureMood => ({
    appetite: { kind, level, faint },
  });
  const moods: CreatureMood[] = [
    {},
    a('underfed', 1),
    a('underfed', 2),
    a('underfed', 3),
    {},
    a('overfed', 1),
    a('overfed', 2),
    a('overfed', 3),
    a('underfed', 2, true),
    a('underfed', 3, true),
    a('overfed', 2, true),
    a('overfed', 3, true),
  ];
  return creatureSheet(
    moods.map((mood) => ({ heading: NORTH, mood })),
    4,
    34,
    'appetite-phone',
  );
}

/** The hub badge (calm, underfed 1-3 and faint, overfed 1-3 and faint) at 40 and 20 px; step hints; stayed. */
function signsSheet(): string {
  const nodes: SvgNode[] = [];
  const badges: (CreatureAppetite | null)[] = [
    null,
    { kind: 'underfed', level: 1 },
    { kind: 'underfed', level: 2 },
    { kind: 'underfed', level: 3 },
    { kind: 'underfed', level: 3, faint: true },
    { kind: 'overfed', level: 1 },
    { kind: 'overfed', level: 2 },
    { kind: 'overfed', level: 3 },
    { kind: 'overfed', level: 3, faint: true },
  ];
  badges.forEach((b, i) => {
    nodes.push(placed(drawAppetiteBadge(PALETTE, 40, b), 24 + i * 70, 24));
    nodes.push(placed(drawAppetiteBadge(PALETTE, 20, b), 34 + i * 70, 76));
  });
  // Three step options fanning ahead (likely, less likely, unlikely), then chance 0 to 1 in a row.
  [
    [0.62, -Math.PI / 2],
    [0.28, -Math.PI / 2 - 0.9],
    [0.1, -Math.PI / 2 + 0.9],
  ].forEach(([chance, angle]) => {
    const x = 90 + Math.cos(angle!) * 50;
    const y = 200 + Math.sin(angle!) * 50;
    nodes.push(placed(drawStepHint(PALETTE, 48, chance!, angle), x - 24, y - 24));
  });
  [0, 0.25, 0.5, 0.75, 1].forEach((chance, i) =>
    nodes.push(placed(drawStepHint(PALETTE, 48, chance, -Math.PI / 2), 200 + i * 54, 150)),
  );
  nodes.push(placed(drawMoment('stayed', PALETTE, 120), 500, 110));
  return paperSheet(670, 250, nodes);
}

function careMarksSheet(): string {
  const nodes: SvgNode[] = [];
  ['forage', 'light-fire', 'feed', 'linger'].forEach((id, i) => {
    let x = 24 + i * 186;
    for (const size of [72, 48, 32]) {
      nodes.push(placed(drawIcon(id, PALETTE, size), x, 24 + (72 - size) / 2));
      x += size + 10;
    }
  });
  [24, 36, 48].forEach((size, i) =>
    nodes.push(placed(drawStayMark(PALETTE, size), 30 + i * 70, 140 + (48 - size) / 2)),
  );
  (['fire', 'feed', 'linger'] as const).forEach((kind, i) =>
    nodes.push(placed(drawMoment(kind, PALETTE, 120), 260 + i * 140, 110)),
  );
  return paperSheet(770, 250, nodes);
}

/** The sample map with this milestone's pieces in place: fires, berries, an underfed keeper's view. */
function careMap(effects: 'full' | 'lite'): string {
  const { cells, creature, characters } = samplePatch(NORTH);
  const fires = new Set(['2,-1', '-1,-1']);
  const placedCells = cells.map((c) => {
    const key = `${c.q},${c.r}`;
    if (key === '-2,2') return { ...c, feature: { look: 'berries' } };
    return fires.has(key) ? { ...c, fire: true } : c;
  });
  return toSvgString(
    renderScene({
      cells: placedCells,
      creature: {
        ...creature,
        appetite: { kind: 'underfed', level: 2 },
        cues: [
          { hex: { q: 2, r: -1 }, reaction: 'toward' },
          { hex: { q: -1, r: -1 }, reaction: 'away' },
        ],
      },
      characters,
      projection: isometric(),
      palette: PALETTE,
      seed: SEED,
      effects,
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
    ...seasonReviewItems(),
    {
      id: 'creature/underfed',
      group: 'Creature care',
      title: 'Underfed: calm, levels 1 to 3, then faint at 2 and 3',
      file: 'creature-underfed.svg',
      ...glance,
      svg: appetiteSheet('underfed'),
    },
    {
      id: 'creature/overfed',
      group: 'Creature care',
      title: 'Overfed: calm, levels 1 to 3, then faint at 2 and 3',
      file: 'creature-overfed.svg',
      ...glance,
      svg: appetiteSheet('overfed'),
    },
    {
      id: 'creature/cues',
      group: 'Creature care',
      title: "Keeper's cues: drawn to the fire, shying from it, unmoved; two at once",
      file: 'creature-cues.svg',
      ...glance,
      svg: cuesSheet(),
    },
    {
      id: 'creature/linger',
      group: 'Creature care',
      title: 'Lying down to linger, beside standing',
      file: 'creature-linger.svg',
      ...glance,
      svg: lingerSheet(),
    },
    {
      id: 'features/care',
      group: 'Creature care',
      title: 'Fires on four tiles and under the veil; berry bushes, picked bare, beside a fire',
      file: 'features-care.svg',
      ...glance,
      svg: careTilesSheet(),
    },
    {
      id: 'creature/appetite-phone',
      group: 'Creature care',
      title: 'Appetite at phone zoom: calm, underfed 1-3; calm, overfed 1-3; faint 2 and 3',
      file: 'creature-appetite-phone.svg',
      ...glance,
      svg: appetitePhoneSheet(),
    },
    {
      id: 'marks/signs',
      group: 'Creature care',
      title: 'Hub badge (calm, underfed, overfed, faint); weighted step hints; the stayed moment',
      file: 'marks-signs.svg',
      ...glance,
      svg: signsSheet(),
    },
    {
      id: 'marks/care',
      group: 'Creature care',
      title: 'Forage, light a fire, feed, linger; the stay hint; fire, feed and linger moments',
      file: 'marks-care.svg',
      ...glance,
      svg: careMarksSheet(),
    },
    {
      id: 'map/care',
      group: 'Creature care',
      title: 'On the map: fires, berries, an underfed creature and two cues',
      file: 'map-care.svg',
      ...glance,
      svg: careMap('full'),
    },
    {
      id: 'map/care-lite',
      group: 'Creature care',
      title: 'The same in lite mode',
      file: 'map-care-lite.svg',
      ...glance,
      svg: careMap('lite'),
    },
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
      id: 'features/sheet',
      group: 'Features',
      title: 'Nodes, sites and traps, as found and used up',
      file: 'features-sheet.svg',
      ...glance,
      svg: featuresSheet(),
    },
    {
      id: 'features/glint',
      group: 'Features',
      title: 'The glint on sensed tiles',
      file: 'features-glint.svg',
      ...glance,
      svg: glintSheet(),
    },
    {
      id: 'features/veil',
      group: 'Features',
      title: 'Explored, unexplored, blank paper, fading',
      file: 'features-veil.svg',
      ...glance,
      svg: veilSheet(),
    },
    {
      id: 'team/marks',
      group: 'Team',
      title: 'Pack from empty to full, stores, unlocks done, work bars',
      file: 'team-marks.svg',
      ...glance,
      svg: teamSheet(),
    },
    {
      id: 'marks/moments',
      group: 'Marks',
      title: 'Reveal, find, trap and survey moments; via marks on a path step',
      file: 'marks-moments.svg',
      ...glance,
      svg: marksSheet(),
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
