import { describe, expect, it } from 'vitest';
import { drawEnding, ENDINGS } from '../src/endings.ts';
import { drawCharacterMarks, drawEscortRing, drawStatusMark } from '../src/escort.ts';
import { drawPerilGauge, drawPerilVignette, drawRouteStrip } from '../src/hud.ts';
import { drawIcon, hasIcon } from '../src/icons.ts';
import { drawMoment, MOMENT_KINDS } from '../src/marks.ts';
import { paletteColours, SPRING } from '../src/palette.ts';
import { DIRECTIONS, isometric } from '../src/projection.ts';
import { riseFor, type PropContext } from '../src/props.ts';
import { rngFor } from '../src/rng.ts';
import { renderScene } from '../src/scene.ts';
import { SEASON_MOMENT_KINDS } from '../src/season-moments.ts';
import { drawSettlement, drawSettlementIcon, type SettlementArt } from '../src/settlements.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { drawRiskMark } from '../src/team-marks.ts';
import { drawThreat, drawThreatIcon, THREAT_LOOKS, type ThreatArt } from '../src/threats.ts';
import type { ArtCell } from '../src/tile.ts';
import { GENTLE_AMBLER } from '../src/creature.ts';

const allowed = paletteColours(SPRING);
/** Every colour is the palette's, the tree serialises under the allowlist, and no number went bad. */
const within = (node: SvgNode): void => {
  walk(node, (n) => {
    for (const name of ['fill', 'stroke', 'stop-color']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url('))
        expect(allowed.has(v.toLowerCase()), `${name}=${v}`).toBe(true);
    }
  });
  const svg = toSvgString(node);
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  expect(svg).not.toMatch(/<text/);
};
const find = (node: SvgNode, attr: string, value?: string): SvgNode[] => {
  const out: SvgNode[] = [];
  walk(node, (n) => {
    if (attr in n.attrs && (value === undefined || n.attrs[attr] === value)) out.push(n);
  });
  return out;
};
/** Subpaths (`M` commands) under nodes carrying `attr=value`, in paths with this fill. */
const subpaths = (node: SvgNode, attr: string, value: string, fill: string): number =>
  find(node, attr, value)
    .flatMap((g) => find(g, 'd'))
    .filter((n) => n.attrs.fill === fill)
    .reduce((sum, n) => sum + String(n.attrs.d).split('M').length - 1, 0);

const ctx = (scale = 1.7): PropContext => ({
  palette: SPRING,
  rng: rngFor('test'),
  origin: { x: 0, y: 0 },
  k: scale,
  squash: 0.8,
  ink: 1.4 * scale,
  rise: riseFor(0.8),
});
const threat = (t: Partial<ThreatArt> = {}): SvgNode =>
  el('g', {}, drawThreat(ctx(), { look: 'captors', strength: 3, ...t }, 64).nodes);
const settlement = (s: Partial<SettlementArt> = {}): SvgNode =>
  el('g', {}, drawSettlement(ctx(), { look: 'hill-folk', attitude: 'wary', ...s }).nodes);

describe('threats', () => {
  it('draws each look within the palette, each different, and an unknown look as a fallback', () => {
    const seen = new Set<string>();
    for (const look of [...THREAT_LOOKS, 'unknown-threat']) {
      const node = threat({ look });
      within(node);
      seen.add(toSvgString(node));
    }
    expect(seen.size).toBe(THREAT_LOOKS.length + 1);
  });

  it('shows strength as that many marks, clamped to 0..6', () => {
    const coral = SPRING.accents.coral.base;
    for (const [strength, marks] of [
      [0, 0],
      [1, 1],
      [4, 4],
      [6, 6],
      [9, 6],
      [-2, 0],
      [Number.NaN, 0],
    ] as const) {
      expect(subpaths(threat({ strength }), 'data-threat', 'strength', coral), `${strength}`).toBe(
        marks,
      );
    }
  });

  it('pulses only when it arrives tomorrow and draws the arrow only toward a neighbour', () => {
    expect(find(threat(), 'data-threat', 'pulse')).toHaveLength(0);
    expect(find(threat({ arrivesTomorrow: true }), 'data-threat', 'pulse')).toHaveLength(1);
    expect(find(threat(), 'data-threat', 'arrow')).toHaveLength(0);
    expect(find(threat({ toward: { q: 0, r: 0 } }), 'data-threat', 'arrow')).toHaveLength(0);
    const arrows = DIRECTIONS.map((d) => toSvgString(threat({ toward: d })));
    expect(new Set(arrows).size).toBe(6);
    for (const d of DIRECTIONS)
      expect(find(threat({ toward: d }), 'data-threat', 'arrow')).toHaveLength(1);
  });

  it('points the arrow the way it steps: east goes right, north goes up the screen', () => {
    const tip = (toward: { q: number; r: number }): { x: number; y: number } => {
      const head = find(threat({ toward }), 'data-threat', 'arrow')[0]!.children[2]!;
      const [x, y] = String(head.attrs.d).slice(1).split(/[ L]/).map(Number);
      return { x: x!, y: y! };
    };
    expect(tip({ q: 1, r: 0 }).x).toBeGreaterThan(30);
    expect(tip({ q: 0, r: -1 }).y).toBeLessThan(-30);
  });

  it('draws a card icon for each look', () => {
    for (const look of THREAT_LOOKS) {
      const icon = drawThreatIcon(look, SPRING, 96, { strength: 3 });
      within(icon);
      expect(icon.attrs.width).toBe(96);
      expect(icon.attrs.viewBox).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    }
  });
});

describe('settlements', () => {
  it('draws the three attitudes within the palette, each different', () => {
    const drawn = (['wary', 'friendly', 'angry'] as const).map((attitude) => {
      const node = settlement({ attitude, favour: 1 });
      within(node);
      return toSvgString(node);
    });
    expect(new Set(drawn).size).toBe(3);
  });

  it('wary smokes, friendly raises a banner, angry lights torches and drops its favour', () => {
    const wary = settlement({ favour: 2 });
    const friendly = settlement({ attitude: 'friendly', favour: 3 });
    const angry = settlement({ attitude: 'angry', favour: 2 });
    expect(find(wary, 'data-settlement', 'smoke').length).toBeGreaterThan(0);
    expect(find(wary, 'data-settlement', 'banner')).toHaveLength(0);
    expect(find(friendly, 'data-settlement', 'banner')).toHaveLength(1);
    expect(find(angry, 'data-settlement', 'torches').length).toBeGreaterThan(0);
    expect(find(angry, 'data-settlement', 'smoke')).toHaveLength(0);
    expect(find(angry, 'data-settlement', 'favour')).toHaveLength(0);
  });

  it('fills one favour mark per point held, out of those needed', () => {
    const ochre = SPRING.accents.ochre.base;
    const paper = SPRING.paper;
    for (const favour of [0, 1, 2, 3, 5]) {
      const node = settlement({ favour });
      expect(subpaths(node, 'data-settlement', 'favour', ochre), `${favour}`).toBe(
        Math.min(favour, 3),
      );
      // The paper backing is one subpath; the rest are empty marks.
      expect(subpaths(node, 'data-settlement', 'favour', paper)).toBe(1 + 3 - Math.min(favour, 3));
    }
    expect(subpaths(settlement({ attitude: 'friendly' }), 'data-settlement', 'favour', ochre)).toBe(
      3,
    );
  });

  it('draws a card icon', () => {
    within(drawSettlementIcon(SPRING, 96, { look: 'hill-folk', attitude: 'angry' }));
  });

  it('draws the river folk on stilts, apart from the hill folk in every attitude', () => {
    for (const attitude of ['wary', 'friendly', 'angry'] as const) {
      const river = settlement({ look: 'river-folk', attitude });
      within(river);
      expect(toSvgString(river)).not.toBe(toSvgString(settlement({ attitude })));
      within(drawSettlementIcon(SPRING, 96, { look: 'river-folk', attitude }));
    }
  });
});

describe('threats and settlements in the scene', () => {
  const scene = (cells: ArtCell[], effects: 'full' | 'lite' = 'full') =>
    renderScene({ cells, projection: isometric(), palette: SPRING, seed: 's', effects });

  it('draws both in full, also under the veil, and leaves out the terrain props', () => {
    const veiled = scene([
      {
        q: 0,
        r: 0,
        terrain: 'forest',
        state: 'unexplored',
        threat: { look: 'swarm', strength: 2 },
        settlement: { look: 'hill-folk', attitude: 'wary' },
      },
    ]);
    within(veiled);
    expect(find(veiled, 'data-threat', 'figure')).toHaveLength(1);
    expect(find(veiled, 'data-settlement', 'huts')).toHaveLength(1);
    // Drawn in full: not wrapped in the veil's faded group.
    walk(veiled, (n) => {
      if (n.tag === 'g' && 'opacity' in n.attrs)
        expect(find(n, 'data-threat').concat(find(n, 'data-settlement'))).toHaveLength(0);
    });
    const plain = scene([{ q: 0, r: 0, terrain: 'forest' }]);
    const withThreat = scene([
      { q: 0, r: 0, terrain: 'forest', threat: { look: 'swarm', strength: 2 } },
    ]);
    // Trees replaced: the forest's props are gone.
    const trees = (n: SvgNode): number =>
      find(n, 'fill', SPRING.ramps.foliage.base).length +
      find(n, 'fill', SPRING.ramps.conifer.base).length;
    expect(trees(plain)).toBeGreaterThan(0);
    expect(trees(withThreat)).toBe(0);
  });

  it('draws nothing on unseen hexes, and no filters in lite mode', () => {
    expect(
      find(
        scene([
          {
            q: 0,
            r: 0,
            terrain: 'plains',
            state: 'unseen',
            threat: { look: 'raiders', strength: 2 },
          },
        ]),
        'data-threat',
      ),
    ).toHaveLength(0);
    const lite = scene(
      [
        {
          q: 0,
          r: 0,
          terrain: 'plains',
          threat: { look: 'raiders', strength: 2, arrivesTomorrow: true },
          settlement: { look: 'hill-folk', attitude: 'angry' },
        },
      ],
      'lite',
    );
    within(lite);
    expect(find(lite, 'filter')).toHaveLength(0);
    expect(find(lite, 'data-threat', 'pulse')).toHaveLength(1);
  });
});

describe('escort and character marks', () => {
  it('draws the escort ring around the guardian, keyed by its hex', () => {
    const ring = drawEscortRing(isometric(), { q: 2, r: -1 }, SPRING);
    within(ring);
    expect(ring.attrs['data-escort']).toBe('2,-1');
  });

  it('draws each mark only when asked, on the ground and on the creature', () => {
    const drawn = drawCharacterMarks(SPRING, { x: 0, y: 0 }, 64, 0.8, 1.4, {
      escorted: true,
      struck: true,
      defending: true,
    });
    const g = el('g', {}, drawn.nodes);
    within(g);
    for (const mark of ['escorted', 'struck', 'defending'])
      expect(find(g, 'data-mark', mark)).toHaveLength(1);
    expect(drawCharacterMarks(SPRING, { x: 0, y: 0 }, 64, 0.8, 1.4, {}).nodes).toHaveLength(0);

    const cells: ArtCell[] = [-1, 0, 1].flatMap((q) =>
      [-1, 0, 1].map((r) => ({ q, r, terrain: 'plains', props: [] })),
    );
    const scene = renderScene({
      cells,
      creature: { q: 0, r: 0, heading: { q: 0, r: -1 }, look: GENTLE_AMBLER },
      characters: [
        { id: 'rider', q: 0, r: 0, accent: 'slate', marks: { defending: true } },
        { id: 'walker', q: 3, r: 0, accent: 'rose', marks: { escorted: true, struck: true } },
        { id: 'plain', q: 3, r: -1, accent: 'teal' },
      ],
      projection: isometric(),
      palette: SPRING,
      seed: 'marks',
    });
    expect(find(scene, 'data-mark', 'defending')).toHaveLength(1);
    expect(find(scene, 'data-mark', 'escorted')).toHaveLength(1);
    expect(find(scene, 'data-mark', 'struck')).toHaveLength(1);
  });

  it('draws the status marks for cards', () => {
    within(drawStatusMark('escorted', SPRING, 24));
    within(drawStatusMark('struck', SPRING, 24));
  });
});

describe('season icons', () => {
  const KEYS = ['strike', 'defend', 'parley', 'offer', 'gift', 'mislead', 'shelter'];

  it('draws every action and boon icon, each different, on the action tile', () => {
    const seen = new Set<string>();
    for (const key of KEYS) {
      expect(hasIcon(key), key).toBe(true);
      const icon = drawIcon(key, SPRING, 48);
      within(icon);
      // The action tile's dashed ring.
      expect(find(icon, 'stroke-dasharray').length, key).toBeGreaterThan(0);
      seen.add(toSvgString(icon));
    }
    expect(seen.size).toBe(KEYS.length);
  });

  it('adds the risk mark when asked, and draws it alone', () => {
    const plain = drawIcon('parley', SPRING, 48);
    const risky = drawIcon('parley', SPRING, 48, { risk: true });
    within(risky);
    expect(risky.children.length).toBe(plain.children.length + 2);
    expect(find(risky, 'fill', SPRING.accents.coral.light)).toHaveLength(1);
    within(drawRiskMark(SPRING, 24));
  });
});

describe('HUD', () => {
  const filled = (node: SvgNode): number =>
    find(node, 'data-peril-mark').filter((n) => n.attrs.fill !== SPRING.paper).length;

  it('draws ten peril marks filled to the peril, deeper from the wounded threshold', () => {
    for (const p of [0, 3, 5, 10, 14, -1]) {
      const gauge = drawPerilGauge(SPRING, 200, p);
      within(gauge);
      expect(find(gauge, 'data-peril-mark')).toHaveLength(10);
      expect(filled(gauge), `${p}`).toBe(Math.max(0, Math.min(10, p)));
    }
    const marks = find(drawPerilGauge(SPRING, 200, 10), 'data-peril-mark');
    expect(marks[3]!.attrs.fill).toBe(SPRING.accents.coral.base);
    expect(marks[4]!.attrs.fill).toBe(SPRING.accents.coral.shade);
    const custom = find(
      drawPerilGauge(SPRING, 200, 6, { max: 6, woundedAt: 3 }),
      'data-peril-mark',
    );
    expect(custom).toHaveLength(6);
    expect(custom[2]!.attrs.fill).toBe(SPRING.accents.coral.shade);
  });

  it('draws the route strip with the creature where it has walked to', () => {
    const at = (walked: number): number => {
      const paw = find(drawRouteStrip(SPRING, 300, walked, 40), 'data-route', 'here')[0]!;
      return Number(/^M([\d.]+)/.exec(String(paw.attrs.d))![1]);
    };
    within(drawRouteStrip(SPRING, 300, 9, 40));
    expect(at(0)).toBeLessThan(at(20));
    expect(at(20)).toBeLessThan(at(40));
    expect(at(99)).toBe(at(40));
    within(drawRouteStrip(SPRING, 120, 3, 12));
  });

  it('darkens the edges more as peril rises, clear at none', () => {
    const edge = (level: number): number => {
      const stops = find(drawPerilVignette(SPRING, level, 'p'), 'stop-opacity');
      return Number(stops.at(-1)!.attrs['stop-opacity']);
    };
    within(drawPerilVignette(SPRING, 0.5));
    expect(edge(0.3)).toBeLessThan(edge(0.9));
    expect(find(drawPerilVignette(SPRING, 0), 'fill', 'url(#br-peril)')[0]!.attrs.opacity).toBe(0);
    expect(() => drawPerilVignette(SPRING, 0.5, 'bad id"')).toThrow();
  });
});

describe('moments and endings', () => {
  it('draws every season moment in three staged parts', () => {
    const seen = new Set<string>();
    for (const kind of SEASON_MOMENT_KINDS) {
      expect(MOMENT_KINDS).toContain(kind);
      const m = drawMoment(kind, SPRING, 96);
      within(m);
      for (const part of ['0', '1', '2'])
        expect(find(m, 'data-part', part).length, `${kind} ${part}`).toBeGreaterThan(0);
      seen.add(toSvgString(m));
    }
    expect(seen.size).toBe(SEASON_MOMENT_KINDS.length);
  });

  it('draws each ending at any screen size, each different, unknown as lost', () => {
    const seen = new Set<string>();
    for (const outcome of ENDINGS) {
      for (const [w, h] of [
        [390, 844],
        [1440, 900],
      ] as const) {
        const scene = drawEnding(outcome, SPRING, w, h);
        within(scene);
        expect(scene.attrs.viewBox).toBe(`0 0 ${w} ${h}`);
        expect(scene.attrs['data-ending']).toBe(outcome);
        seen.add(toSvgString(scene));
      }
    }
    expect(seen.size).toBe(6);
    expect(drawEnding('nonsense', SPRING, 390, 844).attrs['data-ending']).toBe('lost');
    expect(find(drawEnding('wounded', SPRING, 390, 844), 'data-ending', 'bandage')).toHaveLength(1);
    expect(() => drawEnding('safe', SPRING, 390, 844, { idPrefix: 'x y' })).toThrow();
  });
});

describe('determinism', () => {
  it('draws the same SVG for the same input twice', () => {
    const cells: ArtCell[] = [
      {
        q: 0,
        r: 0,
        terrain: 'plains',
        threat: { look: 'raiders', strength: 4, toward: DIRECTIONS[2]!, arrivesTomorrow: true },
        settlement: { look: 'hill-folk', attitude: 'angry' },
      },
      {
        q: 2,
        r: -1,
        terrain: 'hills',
        state: 'unexplored',
        threat: { look: 'swarm', strength: 2 },
      },
      {
        q: -2,
        r: 1,
        terrain: 'forest',
        settlement: { look: 'hill-folk', attitude: 'wary', favour: 2 },
      },
    ];
    const draws: (() => SvgNode)[] = [
      () =>
        renderScene({
          cells,
          creature: { q: 0, r: 2, heading: { q: 0, r: -1 }, look: GENTLE_AMBLER },
          characters: [
            { id: 'a', q: 0, r: 2, accent: 'slate', marks: { defending: true } },
            { id: 'b', q: 2, r: 0, accent: 'rose', marks: { escorted: true, struck: true } },
          ],
          projection: isometric(),
          palette: SPRING,
          seed: 'twice',
        }),
      ...THREAT_LOOKS.map((look) => () => drawThreatIcon(look, SPRING, 64, { strength: 3 })),
      () => drawSettlementIcon(SPRING, 64, { look: 'hill-folk', attitude: 'friendly' }),
      () => drawEscortRing(isometric(), { q: 1, r: 1 }, SPRING),
      () => drawStatusMark('struck', SPRING, 24),
      () => drawPerilGauge(SPRING, 200, 6),
      () => drawRouteStrip(SPRING, 300, 17, 40),
      () => drawPerilVignette(SPRING, 0.6),
      () => drawRiskMark(SPRING, 24),
      ...['strike', 'defend', 'parley', 'offer', 'gift', 'mislead', 'shelter'].map(
        (k) => () => drawIcon(k, SPRING, 48, { risk: k === 'parley' }),
      ),
      ...SEASON_MOMENT_KINDS.map((k) => () => drawMoment(k, SPRING, 96)),
      ...ENDINGS.map((o) => () => drawEnding(o, SPRING, 390, 844)),
    ];
    for (const draw of draws) expect(toSvgString(draw())).toBe(toSvgString(draw()));
  });
});
