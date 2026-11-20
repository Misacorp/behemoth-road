/**
 * The season's three endings as full-screen pictures, no text (the web app sets the title): home safe (a
 * bright morning, the creature walking up to its den with the party), home wounded (dusk, the creature lying
 * at its den with a bandage on its flank) and lost (fog, paw prints fading out, the creature a shape far off).
 * One function draws each for any screen size; the picture is laid out from the shorter side so it reads on
 * a phone held upright and on a wide desktop.
 */
import { DEFAULT_LOOK, drawCharacter, type CharacterLook } from './character.ts';
import { drawCreature, GENTLE_AMBLER, type CreatureLook } from './creature.ts';
import { ellipsePath, smoothOpen, type Point } from './geom.ts';
import { ACCENTS, type Palette } from './palette.ts';
import { inkAttrs } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export const ENDINGS = ['safe', 'wounded', 'lost'] as const;
export type Ending = (typeof ENDINGS)[number];

export interface EndingOptions {
  /** The creature's look (default the gentle ambler). */
  readonly look?: CreatureLook;
  /** The party, drawn beside the creature when it comes home (up to 8 shown). */
  readonly party?: readonly { readonly accent: string; readonly look?: CharacterLook }[];
  /** Prefix for gradient ids, so the picture can share a document. Default `br`. */
  readonly idPrefix?: string;
}

const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();

/** A rolling band of hills across the whole width, its top at `y` with `bumps` gentle rises of height `amp`. */
function hills(w: number, h: number, y: number, amp: number, bumps: number, phase: number): string {
  const pts: Point[] = [];
  const n = Math.max(4, bumps * 4);
  for (let i = 0; i <= n; i += 1) {
    const x = (w * i) / n;
    const t = (i / n) * bumps * Math.PI * 2 + phase;
    pts.push({
      x,
      y: y - amp * (0.5 + 0.5 * Math.sin(t)) * (0.7 + 0.3 * Math.cos(t * 0.37 + phase)),
    });
  }
  return `${smoothOpen(pts)}L${n1(w)} ${n1(h)}L0 ${n1(h)}Z`;
}

/** A tuft of grass at (x, y), `s` its height. */
function tuft(x: number, y: number, s: number): string {
  return `M${n1(x - s * 0.5)} ${n1(y)}q${n1(s * 0.1)} ${n1(-s * 0.6)} ${n1(-s * 0.2)} ${n1(-s)}M${n1(x)} ${n1(y)}q0 ${n1(-s * 0.7)} ${n1(s * 0.1)} ${n1(-s * 1.2)}M${n1(x + s * 0.5)} ${n1(y)}q${n1(-s * 0.05)} ${n1(-s * 0.6)} ${n1(s * 0.3)} ${n1(-s * 0.9)}`;
}

/** Paw prints from `a` to `b`, `n` of them, fading with `fade` (opacity at the far end). */
function pawTrail(
  palette: Palette,
  a: Point,
  b: Point,
  n: number,
  s0: number,
  s1: number,
  fade: number,
): SvgNode[] {
  const out: SvgNode[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / Math.max(1, n - 1);
    const side = i % 2 ? 1 : -1;
    const x = a.x + (b.x - a.x) * t + side * s0 * 0.5 * (1 - t * 0.5);
    const y = a.y + (b.y - a.y) * t;
    const s = s0 + (s1 - s0) * t;
    const d =
      ellipsePath(x, y, s, s * 0.55) +
      [
        [-0.9, -0.75],
        [0, -1.05],
        [0.9, -0.75],
      ]
        .map(([dx, dy]) => ellipsePath(x + dx! * s, y + dy! * s, s * 0.32, s * 0.2))
        .join('');
    out.push(el('path', { d, fill: palette.ink, opacity: n1(0.55 * (1 - t) + fade * t) }));
  }
  return out;
}

/** The home den: a round hill with a dark door, a tree and a curl of smoke-like mist, at (x, y) its foot. */
function den(
  palette: Palette,
  x: number,
  y: number,
  u: number,
  ink: number,
  dusk: boolean,
): SvgNode[] {
  const r = 22 * u;
  const hill = `M${n1(x - r)} ${n1(y)}C${n1(x - r * 0.8)} ${n1(y - r * 0.95)} ${n1(x + r * 0.8)} ${n1(y - r * 0.95)} ${n1(x + r)} ${n1(y)}Z`;
  const door = `M${n1(x - 4 * u)} ${n1(y)}V${n1(y - 4.5 * u)}A${n1(4 * u)} ${n1(4 * u)} 0 0 1 ${n1(x + 4 * u)} ${n1(y - 4.5 * u)}V${n1(y)}Z`;
  const trunk = `M${n1(x + 9 * u)} ${n1(y - 9 * u)}V${n1(y - 20 * u)}`;
  const crown = ellipsePath(x + 9 * u, y - 24 * u, 6 * u, 6.5 * u);
  return [
    el('path', {
      d: ellipsePath(x, y, r * 1.25, 4 * u),
      fill: dusk ? palette.accents.rose.light : palette.accents.ochre.light,
      opacity: 0.8,
    }),
    el('path', { d: hill, fill: dusk ? palette.ramps.moss.shade : palette.ramps.grass.base }),
    el('path', { d: hill, ...inkAttrs(palette.ink, ink) }),
    el('path', { d: door, fill: palette.ink, opacity: 0.85 }),
    el('path', {
      d: ellipsePath(x, y - 2.2 * u, 2.6 * u, 1.4 * u),
      fill: palette.accents.ochre.base,
      opacity: dusk ? 0.9 : 0.6,
    }),
    el('path', { d: trunk, ...inkAttrs(palette.ramps.bark.shade, ink * 1.8) }),
    el('path', { d: crown, fill: dusk ? palette.ramps.conifer.shade : palette.ramps.foliage.base }),
    el('path', { d: crown, ...inkAttrs(palette.ink, ink) }),
  ];
}

/** A row of party standees in front of the creature, centred at `x` on the ground line `y`. */
function partyRow(
  palette: Palette,
  party: readonly { readonly accent: string; readonly look?: CharacterLook }[],
  x: number,
  y: number,
  u: number,
  ink: number,
): SvgNode[] {
  const shown = party.slice(0, 8);
  const gap = 7.5 * u;
  return shown.flatMap((p, i) => {
    const at = { x: x + (i - (shown.length - 1) / 2) * gap, y: y + (i % 2) * 1.6 * u };
    return drawCharacter(palette, p.accent, at, 11 * u, 0.8, ink, p.look ?? DEFAULT_LOOK).nodes;
  });
}

/**
 * An ending as a full-screen `<svg>` of `width` × `height` px. `safe`, `wounded` or `lost`; an unknown
 * outcome draws `lost`. No text: the title is the web app's.
 */
export function drawEnding(
  outcome: string,
  palette: Palette,
  width: number,
  height: number,
  options: EndingOptions = {},
): SvgNode {
  const kind: Ending = (ENDINGS as readonly string[]).includes(outcome)
    ? (outcome as Ending)
    : 'lost';
  const w = Number.isFinite(width) && width > 0 ? width : 390;
  const h = Number.isFinite(height) && height > 0 ? height : 844;
  const prefix = options.idPrefix ?? 'br';
  if (!/^[\w-]+$/.test(prefix)) throw new Error(`Bad idPrefix: ${prefix}`);
  const look = options.look ?? GENTLE_AMBLER;
  const party =
    options.party ?? [0, 1, 2].map((i) => ({ accent: ACCENTS[(i * 3) % ACCENTS.length]! }));
  // One unit is a hundredth of the shorter side (a tall phone counts a little wider), so the picture keeps
  // its size against the screen; the subject sits in the middle third and the land fills the rest.
  const u = Math.min(w, h * 1.1) / 100;
  const ink = Math.max(1, 0.32 * u);
  const cx = w / 2;
  const horizon = h * 0.56;
  const ground = h * 0.74;
  const skyId = `${prefix}-ending-sky`;
  const edgeId = `${prefix}-ending-edge`;
  const sky: Record<Ending, [string, string]> = {
    safe: [palette.accents.sky.light, palette.paper],
    wounded: [palette.accents.plum.light, palette.accents.ochre.light],
    lost: [palette.accents.slate.light, palette.fog],
  };
  const defs = el('defs', {}, [
    el('linearGradient', { id: skyId, x1: 0, y1: 0, x2: 0, y2: 1 }, [
      el('stop', { offset: '0%', 'stop-color': sky[kind][0] }),
      el('stop', { offset: '100%', 'stop-color': sky[kind][1] }),
    ]),
    el('radialGradient', { id: edgeId, cx: '50%', cy: '50%', r: '75%' }, [
      el('stop', { offset: '60%', 'stop-color': palette.paperDeep, 'stop-opacity': 0 }),
      el('stop', {
        offset: '100%',
        'stop-color': kind === 'lost' ? palette.shadow : palette.paperDeep,
        'stop-opacity': kind === 'lost' ? 0.55 : 0.7,
      }),
    ]),
  ]);
  const nodes: SvgNode[] = [
    defs,
    el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${skyId})` }),
  ];

  // The sun: high and bright by morning, low and warm at dusk, a pale disc behind the fog.
  if (kind === 'safe') {
    const s = { x: cx + 26 * u, y: horizon - 40 * u };
    const rays = Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 12;
      const r0 = 10 * u;
      const r1 = (i % 2 ? 13 : 15.5) * u;
      return `M${n1(s.x + Math.cos(a) * r0)} ${n1(s.y + Math.sin(a) * r0)}L${n1(s.x + Math.cos(a) * r1)} ${n1(s.y + Math.sin(a) * r1)}`;
    }).join('');
    nodes.push(
      el('path', { d: ellipsePath(s.x, s.y, 8 * u, 8 * u), fill: palette.accents.ochre.base }),
      el('path', {
        d: ellipsePath(s.x, s.y, 8 * u, 8 * u),
        ...inkAttrs(palette.accents.ochre.shade, ink),
      }),
      el('path', { d: rays, ...inkAttrs(palette.accents.ochre.shade, ink * 1.2) }),
    );
    // Three birds.
    const birds = [
      [cx - 30 * u, horizon - 44 * u, 2.6],
      [cx - 22 * u, horizon - 48 * u, 2],
      [cx - 16 * u, horizon - 41 * u, 1.6],
    ]
      .map(
        ([x, y, s]) =>
          `M${n1(x! - s! * u)} ${n1(y!)}q${n1(s! * 0.5 * u)} ${n1(-s! * 0.6 * u)} ${n1(s! * u)} 0q${n1(s! * 0.5 * u)} ${n1(-s! * 0.6 * u)} ${n1(s! * u)} 0`,
      )
      .join('');
    nodes.push(el('path', { d: birds, ...inkAttrs(palette.ink, ink) }));
  } else if (kind === 'wounded') {
    const s = { x: cx - 24 * u, y: horizon - 3 * u };
    nodes.push(
      el('path', { d: ellipsePath(s.x, s.y, 13 * u, 13 * u), fill: palette.accents.coral.light }),
      el('path', { d: ellipsePath(s.x, s.y, 9 * u, 9 * u), fill: palette.accents.coral.base }),
    );
  } else {
    nodes.push(
      el('path', {
        d: ellipsePath(cx + 18 * u, horizon - 30 * u, 9 * u, 9 * u),
        fill: palette.paper,
        opacity: 0.6,
      }),
    );
  }

  // Far hills, then the near land.
  const far =
    kind === 'lost'
      ? palette.ramps.rock.light
      : kind === 'wounded'
        ? palette.ramps.heath.base
        : palette.ramps.moss.light;
  const near =
    kind === 'lost'
      ? palette.ramps.neutral.light
      : kind === 'wounded'
        ? palette.ramps.heath.light
        : palette.ramps.grass.light;
  nodes.push(
    el('path', {
      d: hills(w, h, horizon, 9 * u, Math.max(2, Math.round(w / (40 * u))), 0.6),
      fill: far,
    }),
    el('path', {
      d: hills(w, h, horizon, 9 * u, Math.max(2, Math.round(w / (40 * u))), 0.6),
      ...inkAttrs(palette.inkSoft, ink),
    }),
    el('path', {
      d: hills(w, h, horizon + 8 * u, 5 * u, Math.max(2, Math.round(w / (28 * u))), 2.1),
      fill: near,
    }),
  );

  const creatureAt = { x: cx - 6 * u, y: ground };
  const homeAt = { x: cx + 24 * u, y: horizon + 13 * u };
  if (kind !== 'lost') {
    nodes.push(...den(palette, homeAt.x, homeAt.y, u, ink, kind === 'wounded'));
    nodes.push(
      el('path', {
        d: smoothOpen([
          { x: -2 * u, y: h * 0.95 },
          { x: creatureAt.x - 20 * u, y: ground + 6 * u },
          { x: creatureAt.x + 14 * u, y: ground - 1 * u },
          { x: homeAt.x - 2 * u, y: homeAt.y + 1 * u },
        ]),
        ...inkAttrs(palette.ramps.trodden.base, 7 * u),
        opacity: 0.7,
      }),
    );
    const drawn = drawCreature(
      palette,
      look,
      creatureAt,
      16 * u,
      0.8,
      ink,
      { q: 1, r: 0 },
      0,
      kind === 'wounded' ? { pose: 'lying' } : {},
    );
    nodes.push(...drawn.nodes);
    if (kind === 'wounded') {
      // A bandage wound over the flank: a paper band, its wrap lines, a rose spot showing through.
      const b = { x: creatureAt.x - 8 * u, y: creatureAt.y + 3 * u };
      const band = `M${n1(b.x - 3.5 * u)} ${n1(b.y - 5 * u)}Q${n1(b.x - 1.5 * u)} ${n1(b.y - 5.8 * u)} ${n1(b.x)} ${n1(b.y - 5.6 * u)}L${n1(b.x + 3 * u)} ${n1(b.y + 3 * u)}Q${n1(b.x + 1 * u)} ${n1(b.y + 4 * u)} ${n1(b.x - 1 * u)} ${n1(b.y + 3.8 * u)}Z`;
      nodes.push(
        el('path', { d: band, fill: palette.paper, 'data-ending': 'bandage' }),
        el('path', {
          d: ellipsePath(b.x - 0.3 * u, b.y - 1 * u, 1.1 * u, 1.4 * u),
          fill: palette.accents.rose.base,
        }),
        el('path', { d: band, ...inkAttrs(palette.ink, ink) }),
        el('path', {
          d: `M${n1(b.x - 2.6 * u)} ${n1(b.y - 2.4 * u)}L${n1(b.x + 0.9 * u)} ${n1(b.y - 3.4 * u)}M${n1(b.x - 1.4 * u)} ${n1(b.y + 1.4 * u)}L${n1(b.x + 2.1 * u)} ${n1(b.y + 0.4 * u)}`,
          ...inkAttrs(palette.inkSoft, ink * 0.8),
        }),
      );
    }
    nodes.push(...partyRow(palette, party, creatureAt.x - 2 * u, ground + 17 * u, u, ink));
  } else {
    // Lost: a faint shape far off in the fog, prints leading toward it and fading, fog banks over all.
    const far = drawCreature(
      palette,
      look,
      { x: cx + 10 * u, y: horizon + 6 * u },
      6 * u,
      0.8,
      ink * 0.8,
      { q: 0, r: -1 },
    );
    const bank = (y: number, amp: number, phase: number, o: number): SvgNode =>
      el('path', {
        d: hills(w, h, y, amp, Math.max(2, Math.round(w / (30 * u))), phase),
        fill: palette.fog,
        opacity: o,
      });
    nodes.push(el('g', { opacity: 0.3 }, far.nodes), bank(horizon + 4 * u, 5 * u, 1.2, 0.7));
    nodes.push(
      ...pawTrail(
        palette,
        { x: cx - 10 * u, y: h * 0.93 },
        { x: cx + 6 * u, y: horizon + 12 * u },
        9,
        2.6 * u,
        1.1 * u,
        0.06,
      ),
    );
    nodes.push(bank(horizon + 18 * u, 4 * u, 2.8, 0.3), bank(h * 0.88, 3 * u, 0.4, 0.2));
    nodes.push(
      el('path', {
        d: [0, 1, 2]
          .map((i) => {
            const y = horizon - (6 + i * 7) * u;
            const x = cx + (i % 2 ? -18 : 6) * u;
            return `M${n1(x - 18 * u)} ${n1(y)}C${n1(x - 8 * u)} ${n1(y - 2 * u)} ${n1(x + 8 * u)} ${n1(y + 2 * u)} ${n1(x + 18 * u)} ${n1(y)}`;
          })
          .join(''),
        ...inkAttrs(palette.inkSoft, ink),
        opacity: 0.6,
      }),
    );
  }

  // Foreground tufts along the bottom.
  const tufts = Array.from({ length: Math.max(4, Math.round(w / (14 * u))) }, (_, i) => {
    const x = (i + 0.5) * (w / Math.max(4, Math.round(w / (14 * u))));
    const y = h * (0.9 + 0.04 * Math.sin(i * 2.3));
    return tuft(x, y, (2.4 + (i % 3)) * u);
  }).join('');
  nodes.push(
    el('path', {
      d: tufts,
      ...inkAttrs(kind === 'lost' ? palette.inkSoft : palette.ramps.moss.shade, ink),
      opacity: kind === 'lost' ? 0.5 : 0.9,
    }),
  );
  if (kind === 'safe') {
    const flowers = Array.from({ length: Math.max(3, Math.round(w / (24 * u))) }, (_, i) => {
      const x = (i + 0.3) * (w / Math.max(3, Math.round(w / (24 * u))));
      const y = h * (0.86 + 0.05 * Math.cos(i * 1.7));
      return ellipsePath(x, y, 1.1 * u, 1.1 * u);
    }).join('');
    nodes.push(
      el('path', {
        d: flowers,
        fill: palette.accents.rose.base,
        stroke: palette.ink,
        'stroke-width': ink * 0.6,
      }),
    );
  }
  nodes.push(el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${edgeId})` }));
  return el(
    'svg',
    { viewBox: `0 0 ${n1(w)} ${n1(h)}`, width: n1(w), height: n1(h), 'data-ending': kind },
    nodes,
  );
}
