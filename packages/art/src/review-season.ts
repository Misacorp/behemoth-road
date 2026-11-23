/**
 * The Milestone 5 review sheets: threats, settlements, the escort and the warden's marks, the season's
 * icons, HUD and moments, the three endings, and the map with all of it at phone and desktop scale.
 */
import { assignLooks, type CharacterArt } from './character.ts';
import { ART_TUNING } from './config.ts';
import { GENTLE_AMBLER } from './creature.ts';
import { drawEnding } from './endings.ts';
import { drawEscortRing, drawStatusMark } from './escort.ts';
import { drawPerilGauge, drawPerilVignette, drawRouteStrip } from './hud.ts';
import { drawIcon } from './icons.ts';
import { drawMoment } from './marks.ts';
import { SPRING } from './palette.ts';
import { DIRECTIONS, hexCenter, isometric, type Hex } from './projection.ts';
import type { ReviewDraft } from './review.ts';
import { samplePatch } from './sample.ts';
import { renderScene, renderSceneFramed } from './scene.ts';
import { SEASON_MOMENT_KINDS } from './season-moments.ts';
import { drawSettlementIcon, type Attitude } from './settlements.ts';
import { el, toSvgString, type SvgNode } from './svg.ts';
import { drawRiskMark } from './team-marks.ts';
import { drawThreatIcon, THREAT_LOOKS } from './threats.ts';
import type { ArtCell } from './tile.ts';

const PALETTE = SPRING;
const NORTH = { q: 0, r: -1 };

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

/** A sub-picture scaled into a box: `node`'s viewBox shown at (x, y) in `width` × `height`. */
function framed(node: SvgNode, x: number, y: number, width: number, height: number): SvgNode {
  return el('svg', { ...node.attrs, x, y, width, height }, node.children);
}

/** Cells in rows of `perRow`, one hex apart. */
function gridCell(i: number, perRow: number): { q: number; r: number } {
  const col = i % perRow;
  const row = Math.floor(i / perRow);
  return { q: 2 * col, r: -col + 2 * row };
}

/** The four threats in rows: strength 1 to 6, arrows in each direction, the last of each row arriving tomorrow. */
function threatsSheet(): string {
  const terrains = ['plains', 'hills', 'rocks', 'forest'];
  const cells: ArtCell[] = [];
  THREAT_LOOKS.forEach((look, row) => {
    for (let col = 0; col < 4; col += 1) {
      cells.push({
        ...gridCell(row * 4 + col, 4),
        terrain: terrains[row]!,
        threat: {
          look,
          strength: [1, 2, 4, 6][col]! - (col === 3 ? row % 2 : 0),
          toward: DIRECTIONS[(row + col * 2) % 6]!,
          arrivesTomorrow: col === 3,
        },
      });
    }
  });
  return toSvgString(
    renderScene({ cells, projection: isometric(), palette: PALETTE, seed: 'threats-sheet' }),
  );
}

/** The hill folk wary at favour 0 to 2, friendly, angry, and angry with the raiders it sent. */
function settlementsSheet(): string {
  const spots: { attitude: Attitude; favour: number; raiders?: boolean; state?: 'unexplored' }[] = [
    { attitude: 'wary', favour: 0 },
    { attitude: 'wary', favour: 1 },
    { attitude: 'wary', favour: 2, state: 'unexplored' },
    { attitude: 'friendly', favour: 3 },
    { attitude: 'angry', favour: 1 },
    { attitude: 'angry', favour: 0, raiders: true },
  ];
  const cells: ArtCell[] = spots.map((s, i) => ({
    ...gridCell(i, 4),
    terrain: i % 2 ? 'hills' : 'plains',
    ...(s.state ? { state: s.state } : {}),
    settlement: { look: 'hill-folk', attitude: s.attitude, favour: s.favour },
    ...(s.raiders
      ? { threat: { look: 'raiders', strength: 2, toward: DIRECTIONS[3]!, arrivesTomorrow: false } }
      : {}),
  }));
  return toSvgString(
    renderScene({ cells, projection: isometric(), palette: PALETTE, seed: 'settlements-sheet' }),
  );
}

const PARTY = assignLooks([1000, 8919, 16838, 24757, 32676, 40595]);

/** A warden's escort ring with an escorted and a struck character, and two wardens defending on the creature. */
function escortSheet(): string {
  const cells: ArtCell[] = [];
  for (let q = -4; q <= 4; q += 1)
    for (let r = -4; r <= 4; r += 1)
      if (Math.abs(q) + Math.abs(r) + Math.abs(q + r) <= 6 && q + r >= -2 && q + r <= 3)
        cells.push({ q, r, terrain: (q + r) % 3 ? 'plains' : 'hills', props: [] });
  const warden: Hex = { q: 2, r: -1 };
  const characters = [
    { id: 'g', ...warden, ...PARTY[0]!, marks: {} },
    { id: 'e', q: 2, r: 0, ...PARTY[1]!, marks: { escorted: true } },
    { id: 'f', q: 3, r: -2, ...PARTY[2]!, marks: { escorted: true, struck: true } },
    { id: 's', q: -3, r: 2, ...PARTY[3]!, marks: { struck: true } },
    { id: 'd1', q: -1, r: 0, ...PARTY[4]!, marks: { defending: true } },
    { id: 'd2', q: -1, r: 0, ...PARTY[5]!, marks: { defending: true, struck: true } },
  ];
  const scene = renderSceneFramed({
    cells,
    creature: { q: -1, r: 0, heading: { q: 1, r: -1 }, look: GENTLE_AMBLER },
    characters,
    projection: isometric(),
    palette: PALETTE,
    seed: 'escort-sheet',
  });
  return toSvgString(withUnder(scene.svg, [drawEscortRing(isometric(), warden, PALETTE)]));
}

/** Inserts overlay nodes under a scene's objects layer (as the map's under-overlays sit). */
function withUnder(svg: SvgNode, under: SvgNode[]): SvgNode {
  const i = svg.children.findIndex((c) => c.attrs['data-layer'] === 'objects');
  return el('svg', svg.attrs, [...svg.children.slice(0, i), ...under, ...svg.children.slice(i)]);
}

/** The action and boon icons at 72, 48 and 32 px, parley with the risk mark, card icons and status marks. */
function iconsSheet(): string {
  const nodes: SvgNode[] = [];
  const rows = [
    ['strike', 'defend', 'parley', 'offer'],
    ['gift', 'mislead', 'shelter'],
  ];
  rows.forEach((row, r) =>
    row.forEach((id, i) => {
      let x = 20 + i * 210;
      for (const size of [72, 48, 32]) {
        nodes.push(placed(drawIcon(id, PALETTE, size), x, 20 + r * 96 + (72 - size) / 2));
        x += size + 10;
      }
    }),
  );
  // Parley with the risk mark (a non-warden), and the risk mark alone.
  let x = 650;
  for (const size of [72, 48, 32]) {
    nodes.push(placed(drawIcon('parley', PALETTE, size, { risk: true }), x, 116 + (72 - size) / 2));
    x += size + 8;
  }
  nodes.push(placed(drawRiskMark(PALETTE, 24), 800, 210));
  // Card icons: the four threats with their strength, and the settlement in its three attitudes.
  THREAT_LOOKS.forEach((look, i) =>
    nodes.push(placed(drawThreatIcon(look, PALETTE, 96, { strength: i + 2 }), 20 + i * 106, 210)),
  );
  (['wary', 'friendly', 'angry'] as const).forEach((attitude, i) =>
    nodes.push(
      placed(
        drawSettlementIcon(PALETTE, 96, { look: 'hill-folk', attitude, favour: 1 }),
        460 + i * 106,
        210,
      ),
    ),
  );
  nodes.push(placed(drawStatusMark('escorted', PALETTE, 32), 800, 250));
  nodes.push(placed(drawStatusMark('struck', PALETTE, 32), 800, 286));
  return paperSheet(860, 330, nodes);
}

/** The peril gauge 0 to 10 and the route strip, at a phone's width and a desktop's; the vignette at three levels. */
function hudSheet(): string {
  const nodes: SvgNode[] = [];
  [0, 2, 4, 5, 7, 9, 10].forEach((p, i) => {
    nodes.push(placed(drawPerilGauge(PALETTE, 170, p), 20, 20 + i * 30));
    nodes.push(placed(drawPerilGauge(PALETTE, 280, p), 220, 20 + i * 30));
  });
  [
    [0, 40],
    [9, 40],
    [31, 40],
    [40, 40],
    [5, 12],
  ].forEach(([w, t], i) => {
    nodes.push(placed(drawRouteStrip(PALETTE, 170, w!, t!), 20, 250 + i * 32));
    nodes.push(placed(drawRouteStrip(PALETTE, 280, w!, t!), 220, 250 + i * 32));
  });
  // The vignette over a plain map at peril 3, 6 and 9.
  const map = renderScene({
    cells: samplePatch(NORTH).cells,
    projection: isometric(32),
    palette: PALETTE,
    seed: 'hud-vignette',
    effects: 'lite',
  });
  [3, 6, 9].forEach((p, i) => {
    const x = 530;
    const y = 20 + i * 140;
    nodes.push(framed(map, x, y, 300, 130));
    nodes.push(framed(drawPerilVignette(PALETTE, p / 10, `v${p}`), x, y, 300, 130));
    nodes.push(placed(drawPerilGauge(PALETTE, 120, p), x + 8, y + 6));
  });
  return paperSheet(850, 440, nodes);
}

/** The ten season moments, at 110 px. */
function momentsSheet(): string {
  const nodes = SEASON_MOMENT_KINDS.map((kind, i) =>
    placed(drawMoment(kind, PALETTE, 110), 20 + (i % 5) * 150, 20 + Math.floor(i / 5) * 140),
  );
  return paperSheet(760, 290, nodes);
}

/** An ending at a desktop's shape (1440 × 900, shown smaller) beside a phone's (390 × 844). */
function endingSheet(outcome: 'safe' | 'wounded' | 'lost'): string {
  const party = PARTY.slice(0, 4);
  const desk = drawEnding(outcome, PALETTE, 1440, 900, { party, idPrefix: 'desk' });
  const phone = drawEnding(outcome, PALETTE, 390, 844, { party, idPrefix: 'phone' });
  return paperSheet(880, 440, [framed(desk, 16, 16, 608, 380), framed(phone, 648, 16, 200, 433)]);
}

/** The season on the sample map: a captor band arriving tomorrow, a swarm, a wary village, an escort. */
function seasonCells(): {
  cells: ArtCell[];
  characters: CharacterArt[];
} {
  const { cells, characters } = samplePatch(NORTH);
  const extra: Record<string, Partial<ArtCell>> = {
    '0,3': { threat: { look: 'captors', strength: 3, toward: NORTH, arrivesTomorrow: true } },
    '3,-3': { threat: { look: 'swarm', strength: 2, toward: { q: -1, r: 1 } } },
    '-2,2': { settlement: { look: 'hill-folk', attitude: 'wary', favour: 1 } },
    '0,-3': { threat: { look: 'rockslide', strength: 3 }, state: 'unexplored' },
  };
  return {
    cells: cells.map((c) => ({ ...c, ...extra[`${c.q},${c.r}`] })),
    characters: [
      { ...characters[0]!, q: 2, r: 1, accent: 'slate', marks: {} },
      { ...characters[1]!, marks: { defending: true } },
      { ...characters[2]!, marks: { struck: true } },
      { id: 'sample-scholar', q: 2, r: 0, accent: 'plum', marks: { escorted: true } },
    ],
  };
}

/** The season map as a phone shows it (390 × 844 at the first view's zoom), full effects and lite. */
function phoneMap(): string {
  const p = isometric();
  // The first phone view fits 3.5 hexes around the character: about 672 world px across 390 screen px.
  const zoom = 390 / (2 * 3.5 * 1.5 * ART_TUNING.hexSize);
  const { cells, characters } = seasonCells();
  const views = (['full', 'lite'] as const).map((effects, i) => {
    const scene = renderSceneFramed({
      cells,
      creature: samplePatch(NORTH).creature,
      characters,
      projection: p,
      palette: PALETTE,
      seed: 'season-phone',
      effects,
      frame: 'none',
      zoom,
    });
    const centre = hexCenter(p, 0, 0.6);
    const w = 390 / zoom;
    const h = 844 / zoom;
    const svg = withUnder(scene.svg, [drawEscortRing(p, { q: 2, r: 1 }, PALETTE)]);
    const x = 16 + i * 406;
    return [
      el('rect', { x, y: 16, width: 390, height: 844, fill: PALETTE.paper }),
      el(
        'svg',
        {
          viewBox: `${centre.x - w / 2} ${centre.y - h / 2} ${w} ${h}`,
          x,
          y: 16,
          width: 390,
          height: 844,
        },
        svg.children,
      ),
      framed(drawPerilVignette(PALETTE, 0.4, `pv${i}`), x, 16, 390, 844),
      el('rect', {
        x: x + 8,
        y: 24,
        width: 374,
        height: 64,
        rx: 14,
        fill: PALETTE.paper,
        opacity: 0.85,
      }),
      placed(drawPerilGauge(PALETTE, 200, 4), x + 20, 34),
      placed(drawRouteStrip(PALETTE, 340, 9, 40), x + 20, 58),
    ];
  });
  return paperSheet(812, 876, views.flat());
}

/** The season map at desktop scale (zoom 1), a 900 × 560 window of it. */
function desktopMap(): string {
  const p = isometric();
  const { cells, characters } = seasonCells();
  const scene = renderSceneFramed({
    cells,
    creature: samplePatch(NORTH).creature,
    characters,
    projection: p,
    palette: PALETTE,
    seed: 'season-desktop',
    frame: 'none',
  });
  const c = hexCenter(p, 0, 0.3);
  const svg = withUnder(scene.svg, [drawEscortRing(p, { q: 2, r: 1 }, PALETTE)]);
  return paperSheet(900, 560, [
    el(
      'svg',
      { viewBox: `${c.x - 450} ${c.y - 280} 900 560`, x: 0, y: 0, width: 900, height: 560 },
      svg.children,
    ),
    framed(drawPerilVignette(PALETTE, 0.4, 'dv'), 0, 0, 900, 560),
    el('rect', {
      x: 16,
      y: 14,
      width: 330,
      height: 60,
      rx: 14,
      fill: PALETTE.paper,
      opacity: 0.85,
    }),
    placed(drawPerilGauge(PALETTE, 280, 4), 28, 22),
    placed(drawRouteStrip(PALETTE, 300, 9, 40), 28, 46),
  ]);
}

export function seasonReviewItems(): ReviewDraft[] {
  const glance = { kind: 'glance' } as const;
  const group = 'Season';
  return [
    {
      id: 'season/map-phone',
      group,
      title:
        'The season on a phone: threats, a village, an escort, a defender, peril 4 (full, then lite)',
      file: 'season-map-phone.svg',
      ...glance,
      svg: phoneMap(),
    },
    {
      id: 'season/map-desktop',
      group,
      title: 'The same at desktop scale',
      file: 'season-map-desktop.svg',
      ...glance,
      svg: desktopMap(),
    },
    {
      id: 'season/threats',
      group,
      title:
        'Captors, swarm, rockslide, raiders: strength marks, next-step arrows, the last of each arriving tomorrow',
      file: 'season-threats.svg',
      ...glance,
      svg: threatsSheet(),
    },
    {
      id: 'season/settlements',
      group,
      title:
        'Hill folk: wary with favour 0, 1, 2 (under the veil), friendly, angry, angry with its raiders',
      file: 'season-settlements.svg',
      ...glance,
      svg: settlementsSheet(),
    },
    {
      id: 'season/escort',
      group,
      title: 'A warden’s escort ring, escorted and struck marks, wardens defending on the creature',
      file: 'season-escort.svg',
      ...glance,
      svg: escortSheet(),
    },
    {
      id: 'season/icons',
      group,
      title:
        'Strike, defend, parley, offer; gift, mislead, shelter; parley at risk; card icons and status marks',
      file: 'season-icons.svg',
      ...glance,
      svg: iconsSheet(),
    },
    {
      id: 'season/hud',
      group,
      title:
        'Peril gauge 0 to 10 and the route strip at phone and desktop widths; the vignette at peril 3, 6, 9',
      file: 'season-hud.svg',
      ...glance,
      svg: hudSheet(),
    },
    {
      id: 'season/moments',
      group,
      title:
        'Threat appears, creature struck, character struck, threat hit, cleared, defence holds, befriended, angered, boon, season end',
      file: 'season-moments.svg',
      ...glance,
      svg: momentsSheet(),
    },
    ...(['safe', 'wounded', 'lost'] as const).map((outcome) => ({
      id: `season/ending-${outcome}`,
      group,
      title: `Ending: ${{ safe: 'home safe', wounded: 'home, wounded', lost: 'lost' }[outcome]} (desktop and phone)`,
      file: `season-ending-${outcome}.svg`,
      ...glance,
      svg: endingSheet(outcome),
    })),
  ];
}
